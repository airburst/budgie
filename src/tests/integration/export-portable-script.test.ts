import { exportPortableFromFile } from "../../../scripts/export-portable";
import * as schema from "@/main/db/schema";
import { parsePortableData } from "@/services/portable-data";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationsDir = "src/main/db/migrations/";
const journal: { entries: { tag: string }[] } = JSON.parse(
  readFileSync(`${migrationsDir}meta/_journal.json`, "utf8"),
);

const sha = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "budgie-export-test-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("scripts/export-portable", () => {
  it("exports a current-schema database file", async () => {
    const dbPath = join(dir, "current.db");
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    migrate(drizzle(sqlite, { schema }), { migrationsFolder: migrationsDir });
    sqlite.exec(
      "INSERT INTO accounts (name, type, balance, currency) VALUES ('Joint', 'bank', 0, 'GBP')",
    );
    sqlite.exec(
      "INSERT INTO transactions (account_id, date, payee, amount) VALUES (1, '2026-03-01', 'Shop', -4.5)",
    );
    sqlite.close();

    const out = join(dir, "current.json");
    const summary = await exportPortableFromFile(dbPath, out);
    expect(summary.accounts).toBe(1);
    expect(summary.transactions).toBe(1);

    const data = await parsePortableData(await readFile(out, "utf8"));
    expect(data.transactions[0]?.payee).toBe("Shop");
  });

  it("migrates a populated older database without touching the original", async () => {
    const dbPath = join(dir, "old.db");
    // Build a real pre-0013 database: same drizzle history table as a user's file.
    const olderFolder = join(dir, "migrations-before-last");
    await cp(migrationsDir, olderFolder, { recursive: true });
    await writeFile(
      join(olderFolder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, -1) }),
    );
    const sqlite = new Database(dbPath);
    migrate(drizzle(sqlite, { schema }), { migrationsFolder: olderFolder });
    sqlite.pragma("foreign_keys = OFF");
    sqlite.exec(
      "INSERT INTO accounts (name, type, balance, currency) VALUES ('Old', 'bank', 0, 'GBP')",
    );
    sqlite.exec("INSERT INTO envelopes (name) VALUES ('Groceries')");
    sqlite.exec(
      "INSERT INTO envelope_categories (envelope_id, category_id) VALUES (1, 1)",
    );
    sqlite.close();
    const before = sha(dbPath);

    const out = join(dir, "old.json");
    const summary = await exportPortableFromFile(dbPath, out);
    expect(summary.accounts).toBe(1);
    expect(summary.envelopes).toBe(1);
    expect(sha(dbPath)).toBe(before);
  });

  it("refuses to overwrite without --force and rejects a missing database", async () => {
    const dbPath = join(dir, "current.db");
    const out = join(dir, "current.json");
    await expect(exportPortableFromFile(dbPath, out)).rejects.toThrow(
      /--force/,
    );
    await expect(
      exportPortableFromFile(dbPath, out, { force: true }),
    ).resolves.toBeDefined();
    await expect(
      exportPortableFromFile(join(dir, "nope.db"), join(dir, "x.json")),
    ).rejects.toThrow(/not found/);
    await expect(exportPortableFromFile(dbPath, dbPath)).rejects.toThrow(
      /must not be/,
    );
  });
});
