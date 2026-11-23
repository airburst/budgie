import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SnapshotStore } from "../src/store";
import type { WranglerTarget } from "./wrangler-executor";

/** R2 bucket name for a target; keep in step with the wrangler configs. */
export function bucketFor(target: WranglerTarget): string {
  if (target.mode === "local") return "budgie-sync-snapshots-local";
  return target.env === "staging"
    ? "budgie-sync-snapshots-staging"
    : "budgie-sync-snapshots";
}

function wrangler(target: WranglerTarget, args: string[]) {
  const full = [
    "wrangler",
    "r2",
    "object",
    ...args,
    `--${target.mode}`,
    "--config",
    target.config,
  ];
  if (target.mode === "remote") full.push("--jurisdiction", "eu");
  if (target.env) full.push("--env", target.env);
  return spawnSync("bunx", full, { encoding: "utf8" });
}

/**
 * SnapshotStore over `wrangler r2 object get|delete` (admin scripts only;
 * wrangler has no object listing, which is why snapshots are indexed in D1).
 * `--local` uses wrangler's own local R2, not celld's.
 */
export function createWranglerR2Store(target: WranglerTarget): SnapshotStore {
  const bucket = bucketFor(target);
  return {
    put() {
      return Promise.reject(new Error("put is not supported by the CLI store"));
    },
    get(key) {
      const dir = mkdtempSync(join(tmpdir(), "budgie-snap-"));
      const file = join(dir, "object");
      try {
        const proc = wrangler(target, [
          "get",
          `${bucket}/${key}`,
          "--file",
          file,
        ]);
        if (proc.status !== 0) {
          return Promise.resolve(null);
        }
        return Promise.resolve(readFileSync(file, "utf8"));
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    delete(key) {
      const proc = wrangler(target, ["delete", `${bucket}/${key}`]);
      if (proc.status !== 0) {
        return Promise.reject(
          new Error(`wrangler r2 object delete failed: ${proc.stderr}`),
        );
      }
      return Promise.resolve();
    },
  };
}
