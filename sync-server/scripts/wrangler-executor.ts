import { spawnSync } from "node:child_process";
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

/** Arguments for `bunx wrangler d1 execute` (always `--command`, never `--file`). */
export function buildWranglerArgs(
  target: WranglerTarget,
  command: string,
): string[] {
  const args = [
    "wrangler",
    "d1",
    "execute",
    target.database,
    `--${target.mode}`,
    "--config",
    target.config,
    "--command",
    command,
    "--json",
  ];
  if (target.env) args.push("--env", target.env);
  return args;
}

interface WranglerEntry {
  results?: Record<string, unknown>[];
  success?: boolean;
  meta?: { changes?: number };
}

/**
 * Parse `wrangler d1 execute --json` output: one entry per statement (local
 * --file/--command: no `meta.changes`; remote --command: with `meta.changes`).
 * A count mismatch means wrangler took another path (the remote --file import
 * prints one summary entry) and is refused rather than misread.
 */
export function parseWranglerOutput(
  stdout: string,
  expected: number,
): SqlResult[] {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    const start = stdout.search(/^[[{]/m);
    try {
      value = JSON.parse(start >= 0 ? stdout.slice(start) : "");
    } catch {
      throw new Error("wrangler did not print JSON");
    }
  }
  const entries = (Array.isArray(value) ? value : [value]) as WranglerEntry[];
  if (entries.some((e) => e?.success === false)) {
    throw new Error("wrangler reported a failed statement");
  }
  if (entries.length !== expected) {
    throw new Error(
      `wrangler returned ${entries.length} result(s) for ${expected} statements`,
    );
  }
  return entries.map((e) => ({
    rows: e.results ?? [],
    changes: e.meta?.changes ?? 0,
  }));
}

/**
 * Executor that runs statements through `wrangler d1 execute --command`
 * (admin scripts only). `--file` is not used: against a remote database it goes
 * through the D1 import API, prints one summary row instead of a result per
 * statement and takes the database offline while it runs.
 *
 * Atomicity: locally wrangler runs the statements as one `db.batch`
 * (a transaction). Remotely the statements are sent in one `/query` request;
 * whether D1 wraps those in a transaction is not something we can verify, so
 * the admin logic does not depend on it: add-user is the only multi-write
 * operation and a half-done add-user (user without a code) is repaired by
 * running new-invite; the other operations write with one statement.
 */
export function createWranglerExecutor(target: WranglerTarget): SqlExecutor {
  return {
    batch(statements) {
      if (statements.length === 0) return Promise.resolve([]);
      try {
        const command = statements.map((s) => `${inlineParams(s)};`).join("\n");
        const proc = spawnSync("bunx", buildWranglerArgs(target, command), {
          encoding: "utf8",
        });
        if (proc.status !== 0) {
          // stderr/stdout may echo SQL (including the code hash), never the plain code.
          throw new Error(
            `wrangler failed (${proc.status}): ${proc.stderr || proc.stdout}`,
          );
        }
        return Promise.resolve(
          parseWranglerOutput(proc.stdout, statements.length),
        );
      } catch (error) {
        return Promise.reject(error);
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
