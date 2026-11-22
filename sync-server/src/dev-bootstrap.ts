import type { SqlExecutor } from "./executor";
import { applyMigration } from "./migrate";
import initSql from "../migrations/0001_init.sql";

/**
 * Local development only: celld does not run `migrations/`, so the Worker
 * applies them on boot when DEV_MODE is set (wrangler.local.jsonc only).
 * Idempotent: it does nothing if the schema is already there.
 */
export async function ensureDevSchema(executor: SqlExecutor): Promise<void> {
  const [res] = await executor.batch([
    {
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
    },
  ]);
  if (res && res.rows.length > 0) return;
  await applyMigration(executor, initSql);
}
