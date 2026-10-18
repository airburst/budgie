import { browserMigrations, type BrowserMigration } from "./migrations";

export type MigrationDatabase = {
  exec(sql: string): void;
  selectValues<T = unknown>(sql: string): T[];
};

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

const bookkeepingTable = "__drizzle_migrations";

const statementsFor = (sql: string) =>
  sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

export const migrateBrowserDatabase = (
  db: MigrationDatabase,
  migrations: BrowserMigration[] = browserMigrations,
): MigrationResult => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${bookkeepingTable} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at INTEGER
    );
  `);

  const lastMigration = db.selectValues<{ created_at: number }>(
    `SELECT created_at FROM ${bookkeepingTable} ORDER BY created_at DESC LIMIT 1`,
  )[0];
  const lastCreatedAt = lastMigration?.created_at ?? -Infinity;
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
    if (migration.folderMillis <= lastCreatedAt) {
      skipped.push(migration.tag);
      continue;
    }

    db.exec("BEGIN;");
    try {
      for (const statement of statementsFor(migration.sql)) db.exec(statement);
      db.exec(
        `INSERT INTO ${bookkeepingTable} (hash, created_at) VALUES ('${migration.tag}', ${migration.folderMillis})`,
      );
      db.exec("COMMIT;");
      applied.push(migration.tag);
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }

  return { applied, skipped };
};

export const browserMigrationBookkeepingTable = bookkeepingTable;
