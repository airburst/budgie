import { migrateBrowserDatabase, type MigrationDatabase } from "@/web/db/migrate";
import type { BrowserMigration } from "@/web/db/migrations";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Migration 0015 (SY-029): the tombstone store for natural-key tables. */

const dir = "src/main/db/migrations/";
const journal: { entries: { tag: string; when: number }[] } = JSON.parse(
  readFileSync(`${dir}meta/_journal.json`, "utf8"),
);
const fileMigrations: BrowserMigration[] = journal.entries.map((entry) => ({
  tag: entry.tag,
  sql: readFileSync(`${dir}${entry.tag}.sql`, "utf8"),
  folderMillis: entry.when,
}));

const adapter = (sqlite: Database.Database): MigrationDatabase => ({
  exec: (sql) => sqlite.exec(sql),
  selectValues: <T>(sql: string) => sqlite.prepare(sql).all() as T[],
});

const NATURAL_KEY_TABLES = [
  "payees",
  "envelope_categories",
  "budget_allocations",
] as const;

const seed = (sqlite: Database.Database) =>
  sqlite.exec(`
    INSERT INTO categories (name) VALUES ('Food');
    INSERT INTO envelopes (name) VALUES ('Groceries');
    INSERT INTO payees (name) VALUES ('Shop');
    INSERT INTO envelope_categories (envelope_id, category_id) VALUES (1, 1);
    INSERT INTO budget_allocations (envelope_id, month, assigned)
      VALUES (1, '2026-03', 50);
  `);

describe("migration 0015", () => {
  it("upgrades a populated 0014 database and keeps every row", () => {
    const sqlite = new Database(":memory:");
    const upTo = fileMigrations.findIndex(
      (m) => m.tag === "0015_sync_tombstones",
    );
    migrateBrowserDatabase(adapter(sqlite), fileMigrations.slice(0, upTo));
    seed(sqlite);
    const result = migrateBrowserDatabase(adapter(sqlite), fileMigrations);
    expect(result.applied).toEqual(["0015_sync_tombstones"]);
    for (const table of NATURAL_KEY_TABLES) {
      expect(
        sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get(),
      ).toEqual({ n: 1 });
    }
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM sync_tombstones").get(),
    ).toEqual({ n: 0 });
    sqlite.close();
  });

  it("lets a natural-key row leave its table only once the store holds it", () => {
    const sqlite = new Database(":memory:");
    migrateBrowserDatabase(adapter(sqlite), fileMigrations);
    seed(sqlite);
    for (const table of NATURAL_KEY_TABLES) {
      expect(() => sqlite.exec(`DELETE FROM ${table}`)).toThrow(
        `${table} must be tombstoned`,
      );
      sqlite.exec(`INSERT INTO sync_tombstones (tbl, public_id, payload)
        SELECT '${table}', public_id, '{}' FROM ${table}`);
      sqlite.exec(`DELETE FROM ${table}`);
      expect(
        sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get(),
      ).toEqual({ n: 0 });
    }
    // The other tables keep the unconditional guard.
    expect(() => sqlite.exec("DELETE FROM envelopes")).toThrow(
      "envelopes must be tombstoned",
    );
    expect(() =>
      sqlite.exec(
        "INSERT INTO sync_tombstones (tbl, public_id, payload) VALUES ('envelopes', 'x', '{}')",
      ),
    ).toThrow(/CHECK/);
    sqlite.close();
  });

  it("contains no DROP TABLE", () => {
    const sql = readFileSync(`${dir}0015_sync_tombstones.sql`, "utf8");
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });
});
