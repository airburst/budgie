import {
  migrateBrowserDatabase,
  type MigrationDatabase,
} from "@/web/db/migrate";
import type { BrowserMigration } from "@/web/db/migrations";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";

/**
 * Migration 0014 (SY-022): sync columns, triggers and `sync_state`.
 * Everything here is plain SQL, playing the parts of the user (services) and
 * the sync engine as described in the header of 0014_sync_state.sql.
 */

const SYNC_TABLES = [
  "account_reconciliations",
  "accounts",
  "budget_allocations",
  "budget_transfers",
  "categories",
  "envelope_categories",
  "envelopes",
  "payees",
  "scheduled_transactions",
  "transactions",
] as const;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OLD = "2001-01-01 00:00:00";
const H1 = "001795342530000:00000:3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47";
const H2 = "001795342530000:00001:3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47";
const H3 = "001795342800000:00000:9d2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50";

type SyncRow = {
  id: number;
  public_id: string;
  updated_at: string;
  deleted_at: string | null;
  hlc: string | null;
  sync_dirty: number;
  sync_unsealed: number;
  sync_rev: number;
};

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

/** One row in every synced table, inserted the way the services do. */
function seedEveryTable(sqlite: Database.Database) {
  sqlite.exec(`
    INSERT INTO accounts (name, type) VALUES ('Current', 'bank');
    INSERT INTO categories (name) VALUES ('Food');
    INSERT INTO envelopes (name) VALUES ('Groceries'), ('Fun');
    INSERT INTO transactions (account_id, category_id, date, payee, amount)
      VALUES (1, 1, '2026-03-01', 'Shop', -10);
    INSERT INTO account_reconciliations (account_id, date, balance)
      VALUES (1, '2026-03-01', 100);
    INSERT INTO scheduled_transactions (account_id, payee, amount, rrule)
      VALUES (1, 'Rent', -500, 'FREQ=MONTHLY');
    INSERT INTO payees (name) VALUES ('Shop');
    INSERT INTO envelope_categories (envelope_id, category_id) VALUES (1, 1);
    INSERT INTO budget_allocations (envelope_id, month, assigned)
      VALUES (1, '2026-03', 50);
    INSERT INTO budget_transfers (from_envelope_id, to_envelope_id, month, amount)
      VALUES (1, 2, '2026-03', 5);
  `);
  return Object.fromEntries(
    SYNC_TABLES.map((table) => [
      table,
      (
        sqlite.prepare(`SELECT max(id) AS id FROM ${table}`).get() as {
          id: number;
        }
      ).id,
    ]),
  ) as Record<(typeof SYNC_TABLES)[number], number>;
}

const rowOf = (sqlite: Database.Database, table: string, id: number) =>
  sqlite
    .prepare(
      `SELECT id, public_id, updated_at, deleted_at, hlc, sync_dirty, sync_unsealed, sync_rev
         FROM ${table} WHERE id = ?`,
    )
    .get(id) as SyncRow;

/** The engine's statements, exactly as documented in the migration header. */
const engine = {
  seal: (sqlite: Database.Database, table: string, id: number, hlc: string) =>
    sqlite
      .prepare(
        `UPDATE ${table} SET hlc = ?, sync_unsealed = 0, sync_rev = sync_rev + 1
          WHERE id = ? AND sync_unsealed = 1`,
      )
      .run(hlc, id).changes,
  ack: (
    sqlite: Database.Database,
    table: string,
    publicId: string,
    hlc: string,
  ) =>
    sqlite
      .prepare(
        `UPDATE ${table} SET sync_dirty = 0, sync_rev = sync_rev + 1
          WHERE public_id = ? AND hlc = ? AND sync_dirty = 1 AND sync_unsealed = 0`,
      )
      .run(publicId, hlc).changes,
  apply: (
    sqlite: Database.Database,
    table: string,
    publicId: string,
    payload: { updatedAt: string; deletedAt: string | null },
    hlc: string,
  ) =>
    sqlite
      .prepare(
        `UPDATE ${table} SET deleted_at = ?, updated_at = ?, hlc = ?,
                sync_dirty = 0, sync_unsealed = 0, sync_rev = sync_rev + 1
          WHERE public_id = ? AND (hlc IS NULL OR hlc < ?)`,
      )
      .run(payload.deletedAt, payload.updatedAt, hlc, publicId, hlc).changes,
};

describe("migration 0014: trigger behaviour on every synced table", () => {
  let testDb: TestDb;
  let sqlite: Database.Database;
  let ids: ReturnType<typeof seedEveryTable>;

  beforeAll(() => {
    testDb = createTestDb();
    sqlite = testDb.db.$client;
    ids = seedEveryTable(sqlite);
  });
  afterAll(() => testDb.teardown());

  it.each(SYNC_TABLES)("%s: full local / seal / ack / apply cycle", (table) => {
    const id = ids[table];
    // A local insert: canonical UUID v4, updated_at set, dirty and unsealed.
    const inserted = rowOf(sqlite, table, id);
    expect(inserted.public_id).toMatch(UUID_V4);
    expect(inserted.updated_at).toBeTruthy();
    expect(inserted.hlc).toBeNull();
    expect(inserted).toMatchObject({ sync_dirty: 1, sync_unsealed: 1 });

    // Pin updated_at to a known old value (a user write that sets updated_at
    // keeps it, as in 0013, but is still a local edit).
    sqlite
      .prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`)
      .run(OLD, id);
    expect(rowOf(sqlite, table, id)).toMatchObject({
      updated_at: OLD,
      sync_dirty: 1,
      sync_unsealed: 1,
    });

    // Seal: only hlc changes; updated_at and dirtiness untouched, now sealed.
    expect(engine.seal(sqlite, table, id, H1)).toBe(1);
    expect(rowOf(sqlite, table, id)).toMatchObject({
      updated_at: OLD,
      hlc: H1,
      sync_dirty: 1,
      sync_unsealed: 0,
    });

    // Ack sticks.
    const { public_id } = rowOf(sqlite, table, id);
    expect(engine.ack(sqlite, table, public_id, H1)).toBe(1);
    expect(rowOf(sqlite, table, id)).toMatchObject({
      updated_at: OLD,
      hlc: H1,
      sync_dirty: 0,
      sync_unsealed: 0,
    });

    // A local update dirties, unseals and bumps updated_at.
    sqlite
      .prepare(
        `UPDATE ${table} SET deleted_at = '2026-03-02 10:00:00' WHERE id = ?`,
      )
      .run(id);
    const edited = rowOf(sqlite, table, id);
    expect(edited.updated_at).not.toBe(OLD);
    expect(edited).toMatchObject({ hlc: H1, sync_dirty: 1, sync_unsealed: 1 });

    // Seal, then the user edits while the push is in flight: ack must fail.
    sqlite
      .prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`)
      .run(OLD, id);
    expect(engine.seal(sqlite, table, id, H2)).toBe(1);
    sqlite
      .prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`)
      .run(id);
    expect(engine.ack(sqlite, table, public_id, H2)).toBe(0);
    expect(rowOf(sqlite, table, id)).toMatchObject({
      hlc: H2,
      sync_dirty: 1,
      sync_unsealed: 1,
    });

    // Remote apply with a newer hlc, the payload's updated_at equal to the
    // current value, and a changed ordinary column: clean, sealed, exact.
    sqlite
      .prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`)
      .run(OLD, id);
    expect(
      engine.apply(
        sqlite,
        table,
        public_id,
        { updatedAt: OLD, deletedAt: "2026-03-05 09:00:00" },
        H3,
      ),
    ).toBe(1);
    expect(rowOf(sqlite, table, id)).toMatchObject({
      updated_at: OLD,
      deleted_at: "2026-03-05 09:00:00",
      hlc: H3,
      sync_dirty: 0,
      sync_unsealed: 0,
    });

    // An older or equal remote version is skipped by the WHERE clause.
    expect(
      engine.apply(
        sqlite,
        table,
        public_id,
        { updatedAt: "2026-01-01 00:00:00", deletedAt: null },
        H2,
      ),
    ).toBe(0);
    expect(rowOf(sqlite, table, id)).toMatchObject({ hlc: H3, sync_dirty: 0 });
  });

  it("an engine insert (hlc supplied) is left exactly as written", () => {
    const publicId = "0d1c2b3a-4958-4a6b-8c7d-6e5f4a3b2c1d";
    sqlite
      .prepare(
        `INSERT INTO envelope_categories (envelope_id, category_id, public_id, updated_at, hlc)
         VALUES (1, (SELECT max(id) FROM categories), ?, ?, ?)`,
      )
      .run(publicId, OLD, H3);
    const row = sqlite
      .prepare(
        "SELECT public_id, updated_at, hlc, sync_dirty, sync_unsealed, created_at FROM envelope_categories WHERE public_id = ?",
      )
      .get(publicId) as Record<string, unknown>;
    expect(row).toMatchObject({
      public_id: publicId,
      updated_at: OLD,
      hlc: H3,
      sync_dirty: 0,
      sync_unsealed: 0,
    });
    // The created_at default trigger still fills it, without dirtying the row.
    expect(row.created_at).toBeTruthy();
  });

  it("an engine write that changes no sync value is still not a user edit", () => {
    // Join (SPEC.md 11.2): tombstone, clear hlc, not dirty. Here the row is
    // already clean with no hlc, so only sync_rev marks it as an engine write.
    sqlite.exec(`INSERT INTO payees (name) VALUES ('Join me')`);
    sqlite.exec(
      `UPDATE payees SET sync_dirty = 0, sync_unsealed = 0, sync_rev = sync_rev + 1, updated_at = '${OLD}' WHERE name = 'Join me'`,
    );
    sqlite.exec(
      `UPDATE payees SET deleted_at = '2026-03-06 00:00:00', hlc = NULL,
              sync_dirty = 0, sync_unsealed = 0, sync_rev = sync_rev + 1
        WHERE name = 'Join me'`,
    );
    expect(
      sqlite
        .prepare(
          "SELECT updated_at, sync_dirty, sync_unsealed FROM payees WHERE name = 'Join me'",
        )
        .get(),
    ).toEqual({ updated_at: OLD, sync_dirty: 0, sync_unsealed: 0 });
  });

  it("an ordinary drizzle (service-style) write marks the row dirty", async () => {
    const { db, schema } = testDb;
    const [account] = await db
      .insert(schema.accounts)
      .values({ name: "Drizzle", type: "cash" })
      .returning();
    sqlite.exec(
      `UPDATE accounts SET sync_dirty = 0, sync_unsealed = 0, sync_rev = sync_rev + 1, updated_at = '${OLD}' WHERE id = ${account.id}`,
    );
    await db
      .update(schema.accounts)
      .set({ notes: "edited" })
      .where(eq(schema.accounts.id, account.id));
    const [after] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, account.id));
    expect(after.publicId).toMatch(UUID_V4);
    expect(after.updatedAt).not.toBe(OLD);
    expect(after.syncDirty).toBe(true);
    expect(after.syncUnsealed).toBe(true);
  });

  it("behaves the same with recursive_triggers on", () => {
    sqlite.pragma("recursive_triggers = ON");
    try {
      sqlite.exec(`INSERT INTO categories (name) VALUES ('Recursive')`);
      const id = (
        sqlite
          .prepare("SELECT id FROM categories WHERE name = 'Recursive'")
          .get() as {
          id: number;
        }
      ).id;
      sqlite
        .prepare("UPDATE categories SET updated_at = ? WHERE id = ?")
        .run(OLD, id);
      expect(engine.seal(sqlite, "categories", id, H1)).toBe(1);
      const sealed = rowOf(sqlite, "categories", id);
      expect(sealed).toMatchObject({
        updated_at: OLD,
        sync_dirty: 1,
        sync_unsealed: 0,
      });
      expect(engine.ack(sqlite, "categories", sealed.public_id, H1)).toBe(1);
      expect(rowOf(sqlite, "categories", id)).toMatchObject({
        updated_at: OLD,
        sync_dirty: 0,
      });
      sqlite
        .prepare("UPDATE categories SET name = 'Recursive 2' WHERE id = ?")
        .run(id);
      expect(rowOf(sqlite, "categories", id)).toMatchObject({
        sync_dirty: 1,
        sync_unsealed: 1,
      });
    } finally {
      sqlite.pragma("recursive_triggers = OFF");
    }
  });

  it("creates a single-row sync_state", () => {
    expect(sqlite.prepare("SELECT * FROM sync_state").all()).toEqual([
      {
        id: 1,
        device_id: null,
        server_url: null,
        token: null,
        cursor: null,
        last_synced_at: null,
        last_error: null,
        enabled: 0,
        consent_at: null,
        consent_app_version: null,
        created_at: expect.any(String),
      },
    ]);
    expect(() => sqlite.exec("INSERT INTO sync_state (id) VALUES (2)")).toThrow(
      /CHECK constraint/,
    );
    sqlite.exec("UPDATE sync_state SET cursor = '0', enabled = 1");
    expect(
      sqlite.prepare("SELECT cursor, enabled FROM sync_state").get(),
    ).toEqual({ cursor: "0", enabled: 1 });
  });
});

describe("migration 0014 through the web migration executor", () => {
  it("runs on a fresh database", () => {
    const sqlite = new Database(":memory:");
    const result = migrateBrowserDatabase(adapter(sqlite), fileMigrations);
    expect(result.applied.at(-1)).toBe("0014_sync_state");
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM sync_state").get(),
    ).toEqual({ n: 1 });
    sqlite.close();
  });

  it("upgrades a populated 0013 database: rows stay clean, ids untouched", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = OFF");
    const upTo = fileMigrations.findIndex((m) => m.tag === "0014_sync_state");
    migrateBrowserDatabase(adapter(sqlite), fileMigrations.slice(0, upTo));
    const ids = seedEveryTable(sqlite);
    sqlite.exec(
      "UPDATE accounts SET public_id = 'legacy:accounts:1', updated_at = '2020-02-02 02:02:02'",
    );
    const before = Object.fromEntries(
      SYNC_TABLES.map((table) => [
        table,
        sqlite
          .prepare(`SELECT public_id, updated_at FROM ${table} WHERE id = ?`)
          .get(ids[table]),
      ]),
    );

    const result = migrateBrowserDatabase(adapter(sqlite), fileMigrations);
    expect(result.applied).toEqual(["0014_sync_state"]);

    for (const table of SYNC_TABLES) {
      const row = rowOf(sqlite, table, ids[table]);
      expect(row).toMatchObject({
        ...(before[table] as object),
        hlc: null,
        sync_dirty: 0,
        sync_unsealed: 0,
        sync_rev: 0,
      });
    }
    // 0013 ids (legacy and 32-hex) are left for Start to rewrite.
    expect(rowOf(sqlite, "accounts", ids.accounts).public_id).toBe(
      "legacy:accounts:1",
    );
    expect(rowOf(sqlite, "categories", ids.categories).public_id).toMatch(
      /^[0-9a-f]{32}$/,
    );

    // New rows after the upgrade get UUIDs and are dirty.
    sqlite.exec("INSERT INTO payees (name) VALUES ('After upgrade')");
    expect(
      sqlite
        .prepare(
          "SELECT sync_dirty, sync_unsealed FROM payees WHERE name = 'After upgrade'",
        )
        .get(),
    ).toEqual({ sync_dirty: 1, sync_unsealed: 1 });
    expect(
      (
        sqlite
          .prepare("SELECT public_id FROM payees WHERE name = 'After upgrade'")
          .get() as { public_id: string }
      ).public_id,
    ).toMatch(UUID_V4);
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM sync_state").get(),
    ).toEqual({ n: 1 });
    sqlite.close();
  });

  it("contains no DROP TABLE", () => {
    const sql = readFileSync(`${dir}0014_sync_state.sql`, "utf8");
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
  });
});
