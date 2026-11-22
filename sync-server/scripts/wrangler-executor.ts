import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  SqlExecutor,
  SqlResult,
  SqlStatement,
  SqlValue,
} from "../src/executor";

export function sqlLiteral(value: SqlValue): string {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite number");
    return String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/** Substitute `?` placeholders with literals (wrangler d1 execute has no bind parameters). */
export function inlineParams(statement: SqlStatement): string {
  const params = statement.params ?? [];
  let i = 0;
  const sql = statement.sql.replace(/\?/g, () => {
    if (i >= params.length) throw new Error("Too few parameters");
    return sqlLiteral(params[i++] as SqlValue);
  });
  if (i !== params.length) throw new Error("Too many parameters");
  return sql;
}

export interface WranglerTarget {
  /** Pass "--local" or "--remote". */
  mode: "local" | "remote";
  database: string;
  config: string;
  env?: string;
}

/** Executor that runs a batch through `wrangler d1 execute --file`. Admin scripts only. */
export function createWranglerExecutor(target: WranglerTarget): SqlExecutor {
  return {
    batch(statements) {
      if (statements.length === 0) return Promise.resolve([]);
      const dir = mkdtempSync(join(tmpdir(), "budgie-sync-"));
      const file = join(dir, "batch.sql");
      try {
        writeFileSync(
          file,
          statements.map((s) => `${inlineParams(s)};`).join("\n"),
        );
        const args = [
          "wrangler",
          "d1",
          "execute",
          target.database,
          `--${target.mode}`,
          "--config",
          target.config,
          "--file",
          file,
          "--json",
        ];
        if (target.env) args.push("--env", target.env);
        const proc = spawnSync("bunx", args, { encoding: "utf8" });
        if (proc.status !== 0) {
          // stderr/stdout may echo SQL (including the code hash), never the plain code.
          throw new Error(
            `wrangler failed (${proc.status}): ${proc.stderr || proc.stdout}`,
          );
        }
        const parsed = JSON.parse(proc.stdout) as {
          results?: Record<string, unknown>[];
          meta?: { changes?: number };
          success?: boolean;
        }[];
        if (parsed.some((r) => r.success === false)) {
          throw new Error(`wrangler reported a failed statement`);
        }
        return Promise.resolve(
          parsed.map((r): SqlResult => ({
            rows: r.results ?? [],
            changes: r.meta?.changes ?? 0,
          })),
        );
      } catch (error) {
        return Promise.reject(error);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

/** Parse shared CLI flags: --remote, --env <name>, --database <name>, --config <file>. */
export function parseTarget(argv: string[]): {
  positional: string[];
  target: WranglerTarget;
} {
  const positional: string[] = [];
  const target: WranglerTarget = {
    mode: "local",
    database: "",
    config: "wrangler.local.jsonc",
  };
  let configSet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--remote") target.mode = "remote";
    else if (a === "--local") target.mode = "local";
    else if (a === "--env") target.env = argv[++i];
    else if (a === "--database") target.database = argv[++i] as string;
    else if (a === "--config") {
      target.config = argv[++i] as string;
      configSet = true;
    } else positional.push(a);
  }
  if (target.mode === "remote" && !configSet) target.config = "wrangler.jsonc";
  if (!target.database) {
    target.database =
      target.mode === "local"
        ? "budgie-sync-local"
        : target.env === "staging"
          ? "budgie-sync-staging"
          : "budgie-sync";
  }
  return { positional, target };
}
