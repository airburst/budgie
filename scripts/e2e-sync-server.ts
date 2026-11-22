// SY-044: the real sync server for the `sync-real` Playwright project.
//
// Runs the Worker in `sync-server/` on celld (the local stack chosen in
// SY-004) with an empty database on every start:
// - copies `src/`, `migrations/` and `wrangler.local.jsonc` into a fresh
//   temporary project, so celld's state (`<project>/.celld/dev`) is never the
//   developer's `sync-server/.celld` and always starts empty (`--clean` too);
// - a `.dev.vars` there sets ALLOWED_ORIGIN to the e2e preview origin
//   (celld reads it like `wrangler dev` does); DEV_MODE stays on from the
//   local config, so the Worker applies `migrations/` on boot and serves the
//   `/dev/admin/*` seed routes the spec uses for its user and invite;
// - removes the temporary project when Playwright stops it (SIGTERM).
//
// Usage: bun run scripts/e2e-sync-server.ts <port> <allowed-origin>
// (E2E_SYNC_LOGS=1 prints the Worker's request log.)
// celld comes from $CELLD, else PATH, else ~/.local/bin (its installer's
// default). esbuild (needed by celld) comes from the root node_modules.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import process from "node:process";

const [port = "4600", origin = "http://127.0.0.1:4175"] =
  process.argv.slice(2);
const root = resolve(import.meta.dirname, "..");
const server = join(root, "sync-server");

const project = mkdtempSync(join(tmpdir(), "budgie-sync-e2e-"));
cpSync(join(server, "src"), join(project, "src"), { recursive: true });
cpSync(join(server, "migrations"), join(project, "migrations"), {
  recursive: true,
});
cpSync(join(server, "wrangler.local.jsonc"), join(project, "wrangler.jsonc"));
writeFileSync(join(project, ".dev.vars"), `ALLOWED_ORIGIN=${origin}\n`);

const localCelld = join(homedir(), ".local", "bin", "celld");
const celld =
  process.env.CELLD ?? (existsSync(localCelld) ? localCelld : "celld");

const child = spawn(
  celld,
  [
    "dev",
    project,
    "--port",
    port,
    "--no-watch",
    "--clean",
    // The Worker's request log (one JSON line per request), on demand.
    ...(process.env.E2E_SYNC_LOGS === "1" ? ["--logs"] : []),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PATH: [join(root, "node_modules", ".bin"), process.env.PATH].join(
        delimiter,
      ),
    },
  },
);

let cleaned = false;
const cleanup = () => {
  if (cleaned) return;
  cleaned = true;
  rmSync(project, { recursive: true, force: true });
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
child.on("error", (error) => {
  console.error(`e2e sync server: cannot start celld (${celld}):`, error);
  cleanup();
  process.exit(1);
});
child.on("exit", (code, signal) => {
  cleanup();
  process.exit(code ?? (signal ? 0 : 1));
});
