import type { SqlExecutor } from "./executor";

/** Split a migration file into statements (each ends with a semicolon at end of line). */
export function splitStatements(sql: string): string[] {
  return sql
    .split(/;[ \t]*(?:\r?\n|$)/)
    .map((chunk) =>
      chunk
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
}

/** Apply a migration file through an executor, as one batch. */
export async function applyMigration(
  executor: SqlExecutor,
  sql: string,
): Promise<void> {
  await executor.batch(splitStatements(sql).map((s) => ({ sql: s })));
}
