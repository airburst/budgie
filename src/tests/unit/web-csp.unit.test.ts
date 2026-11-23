import { execFileSync } from "node:child_process";
import process from "node:process";
import { describe, expect, it } from "vitest";

// Loads vite.config.ts in a child process with the setting varied and reads
// both generated header blocks (build `_headers` source and dev server).
const cspFor = (syncUrl: string | undefined) => {
  const script = `
    const { loadConfigFromFile } = await import("vite");
    const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, "vite.config.ts");
    const c = loaded.config;
    console.log(JSON.stringify({
      preview: c.preview.headers["Content-Security-Policy"],
      dev: c.server.headers["Content-Security-Policy"],
    }));`;
  const env = { ...process.env, VITE_CONFIG_NATIVE_IGNORE_WARNING: "true" };
  delete env.VITE_SYNC_SERVER_URL;
  if (syncUrl !== undefined) env.VITE_SYNC_SERVER_URL = syncUrl;
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { env, encoding: "utf8", cwd: process.cwd() },
  );
  return JSON.parse(out.trim().split("\n").pop() ?? "{}") as {
    preview: string;
    dev: string;
  };
};

const connectSrc = (csp: string) => /connect-src ([^;]*)/.exec(csp)?.[1];

describe("vite.config CSP", () => {
  it("adds no origin when the sync url is unset", () => {
    const { preview, dev } = cspFor(undefined);
    expect(connectSrc(preview)).toBe("'self'");
    expect(connectSrc(dev)).toBe("'self' ws://localhost:* http://localhost:*");
  });

  it("adds the origin, not the path, to both header blocks", () => {
    const { preview, dev } = cspFor("https://sync.example.dev/v1/");
    expect(connectSrc(preview)).toBe("'self' https://sync.example.dev");
    expect(connectSrc(dev)).toBe(
      "'self' https://sync.example.dev ws://localhost:* http://localhost:*",
    );
  });
}, 60_000);
