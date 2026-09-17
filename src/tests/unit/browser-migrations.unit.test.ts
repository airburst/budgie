import * as schema from "@/main/db/schema";
import {
  migrateBrowserDatabase,
  type MigrationDatabase,
} from "@/web/db/migrate";
import { browserMigrations } from "@/web/db/migrations";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = [
  {
    tag: "0000_initial",
    sql: "CREATE TABLE items (id INTEGER PRIMARY KEY);",
    folderMillis: 1,
  },
  {
    tag: "0001_seed",
    sql: "INSERT INTO items (id) VALUES (1);",
    folderMillis: 2,
  },
];

const createFakeDatabase = (existingTags: string[] = []) => {
  const statements: string[] = [];
  const database: MigrationDatabase = {
    exec: (sql) => statements.push(sql),
    selectValues: () =>
      existingTags.map((created_at) => ({ created_at: Number(created_at) })),
  };
  return { database, statements };
};

describe("browser migration executor", () => {
  it("recognizes metadata written by the Electron Drizzle migrator", () => {
    const sqlite = new Database(":memory:");
    const electronDb = drizzle(sqlite, { schema });
    migrate(electronDb, { migrationsFolder: "src/main/db/migrations" });

    const migrationRows = sqlite
      .prepare(
        'SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at',
      )
      .all() as Array<{ id: number; hash: string; created_at: number }>;
    expect(migrationRows).toHaveLength(13);
    expect(migrationRows.every((row) => row.hash.length > 0)).toBe(true);

    const database: MigrationDatabase = {
      exec: (sql) => sqlite.exec(sql),
      selectValues: <T>(sql: string) => sqlite.prepare(sql).all() as T[],
    };
    expect(migrateBrowserDatabase(database)).toEqual({
      applied: [],
      skipped: browserMigrations.map((migration) => migration.tag),
    });
    sqlite.close();
  });

  it("recognizes migration metadata in a physical Electron database file", () => {
    const directory = mkdtempSync(join(tmpdir(), "budgie-phase0-"));
    const filename = join(directory, "budgie.db");
    const sqlite = new Database(filename);

    try {
      expect(sqlite.pragma("journal_mode = WAL", { simple: true })).toBe("wal");
      const electronDb = drizzle(sqlite, { schema });
      migrate(electronDb, { migrationsFolder: "src/main/db/migrations" });

      const database: MigrationDatabase = {
        exec: (sql) => sqlite.exec(sql),
        selectValues: <T>(sql: string) => sqlite.prepare(sql).all() as T[],
      };
      expect(migrateBrowserDatabase(database)).toEqual({
        applied: [],
        skipped: browserMigrations.map((migration) => migration.tag),
      });
      expect(
        sqlite
          .prepare('SELECT count(*) AS count FROM "__drizzle_migrations"')
          .get(),
      ).toEqual({ count: 13 });
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("applies fresh migrations in order", () => {
    const { database, statements } = createFakeDatabase();

    expect(migrateBrowserDatabase(database, migrations)).toEqual({
      applied: ["0000_initial", "0001_seed"],
      skipped: [],
    });
    expect(statements).toEqual([
      expect.stringContaining("CREATE TABLE IF NOT EXISTS"),
      "BEGIN;",
      migrations[0].sql,
      expect.stringContaining("INSERT INTO __drizzle_migrations"),
      "COMMIT;",
      "BEGIN;",
      migrations[1].sql,
      expect.stringContaining("INSERT INTO __drizzle_migrations"),
      "COMMIT;",
    ]);
  });

  it("skips migrations already recorded by the browser database", () => {
    const { database, statements } = createFakeDatabase(["1"]);

    expect(migrateBrowserDatabase(database, migrations)).toEqual({
      applied: ["0001_seed"],
      skipped: ["0000_initial"],
    });
    expect(statements).not.toContain(migrations[0].sql);
  });

  it("rolls back when a statement fails", () => {
    const statements: string[] = [];
    const database: MigrationDatabase = {
      exec: (sql) => {
        statements.push(sql);
        if (sql === migrations[1].sql) throw new Error("migration failed");
      },
      selectValues: () => [],
    };

    expect(() => migrateBrowserDatabase(database, migrations)).toThrow(
      "migration failed",
    );
    expect(statements.at(-1)).toBe("ROLLBACK;");
  });
});
