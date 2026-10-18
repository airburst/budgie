import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "src/main/db/migrations/";
const journal: { entries: { idx: number; tag: string }[] } = JSON.parse(
  readFileSync(`${dir}meta/_journal.json`, "utf8"),
);

function applyMigration(db: Database.Database, tag: string) {
  const statements = readFileSync(`${dir}${tag}.sql`, "utf8").split(
    "--> statement-breakpoint",
  );
  db.transaction(() => {
    for (const statement of statements) {
      if (statement.trim()) db.exec(statement);
    }
  })();
}

/**
 * SQLite refuses `ADD COLUMN ... DEFAULT (CURRENT_TIMESTAMP)` once a table has
 * rows, so a migration that passes on an empty test database can still fail on
 * a real one. Upgrade a database that already holds data to catch that.
 */
describe("upgrading a populated database", () => {
  it("applies every migration over existing envelope category rows", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = OFF");
    const last = journal.entries.at(-1)!;

    for (const entry of journal.entries.slice(0, -1)) {
      applyMigration(db, entry.tag);
    }
    db.exec(
      "INSERT INTO envelope_categories (envelope_id, category_id) VALUES (1, 1)",
    );

    expect(() => applyMigration(db, last.tag)).not.toThrow();

    const existing = db
      .prepare("SELECT created_at, updated_at, public_id FROM envelope_categories")
      .get() as Record<string, string | null>;
    expect(existing.created_at).toBeTruthy();
    expect(existing.updated_at).toBeTruthy();
    expect(existing.public_id).toBe("legacy:envelope_categories:1");

    db.exec(
      "INSERT INTO envelope_categories (envelope_id, category_id) VALUES (2, 2)",
    );
    const inserted = db
      .prepare("SELECT created_at FROM envelope_categories WHERE envelope_id = 2")
      .get() as { created_at: string | null };
    expect(inserted.created_at).toBeTruthy();
    db.close();
  });
});
