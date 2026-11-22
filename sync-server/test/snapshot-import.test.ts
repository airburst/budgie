// [int] A snapshot built from synced rows imports through Budgie's real portable import.
import * as schema from "@/main/db/schema";
import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import {
  createPortableData,
  importPortableData,
  parsePortableData,
  type PortableData,
} from "@/services/portable-data";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { buildSnapshot, COLLECTIONS } from "../src/snapshot";
import { createTestServer } from "./helpers";
import { hlc, sync, T0 } from "./sync-helpers";

const open: Database.Database[] = [];
afterAll(() => open.forEach((d) => d.close()));

function createDatabase(): DatabaseCapability {
  const sqlite = new Database(":memory:");
  open.push(sqlite);
  migrate(drizzle(sqlite, { schema }), {
    migrationsFolder: "src/main/db/migrations",
  });
  const tx = (): DatabaseTransaction => ({
    execute: async (st) => {
      sqlite.prepare(st.sql).run(...(st.params ?? []));
    },
    query: async <T extends DatabaseRow>(st: DatabaseStatement) =>
      sqlite.prepare(st.sql).all(...(st.params ?? [])) as T[],
  });
  return {
    ...tx(),
    transaction: async <T>(op: (t: DatabaseTransaction) => Promise<T>) => {
      sqlite.exec("BEGIN;");
      try {
        const r = await op(tx());
        sqlite.exec("COMMIT;");
        return r;
      } catch (e) {
        sqlite.exec("ROLLBACK;");
        throw e;
      }
    },
    migrate: async () => undefined,
    close: async () => sqlite.close(),
  };
}

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OPTS = {
  applicationVersion: "test",
  minimumReaderVersion: "1",
  exportedAt: "2026-11-22T00:00:00.000Z",
};

async function seedSource(db: DatabaseCapability) {
  const run = (sql: string, params: (string | number | null)[] = []) =>
    db.execute({ sql, params });
  await run(
    "INSERT INTO accounts (public_id, name, type, balance, currency) VALUES (?, 'Current', 'bank', 1500.5, 'GBP')",
    [uuid(1)],
  );
  await run(
    "INSERT INTO accounts (public_id, name, type, balance, currency, deleted, deleted_at) VALUES (?, 'Old', 'cash', 0, 'GBP', 1, '2026-11-01 00:00:00')",
    [uuid(2)],
  );
  await run(
    "INSERT INTO categories (public_id, name, expense_type) VALUES (?, 'Food', 'expense')",
    [uuid(10)],
  );
  await run(
    "INSERT INTO categories (public_id, name, expense_type, parent_id) VALUES (?, 'Groceries', 'expense', (SELECT id FROM categories WHERE public_id = ?))",
    [uuid(11), uuid(10)],
  );
  await run(
    `INSERT INTO transactions (public_id, account_id, category_id, date, payee, amount, cleared)
     VALUES (?, (SELECT id FROM accounts WHERE public_id = ?), (SELECT id FROM categories WHERE public_id = ?), '2026-11-20', 'Tesco', -42.17, 1)`,
    [uuid(20), uuid(1), uuid(11)],
  );
  await run("INSERT INTO payees (public_id, name) VALUES (?, 'Tesco')", [
    uuid(30),
  ]);
  await run("INSERT INTO envelopes (public_id, name) VALUES (?, 'Groceries')", [
    uuid(40),
  ]);
  await run(
    `INSERT INTO envelope_categories (public_id, envelope_id, category_id)
     VALUES (?, (SELECT id FROM envelopes WHERE public_id = ?), (SELECT id FROM categories WHERE public_id = ?))`,
    [uuid(50), uuid(40), uuid(11)],
  );
  await run(
    "INSERT INTO budget_allocations (public_id, envelope_id, month, assigned) VALUES (?, (SELECT id FROM envelopes WHERE public_id = ?), '2026-11', 250)",
    [uuid(60), uuid(40)],
  );
}

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);
// The migrations seed default rows with non-UUID ids; they are not synced.
const ours = <T extends { publicId: string }>(rows: T[]) =>
  rows.filter((r) => isUuid(r.publicId));

const sortById = <T extends { publicId: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.publicId.localeCompare(b.publicId));

describe("snapshot import", () => {
  it("imports into a createTestDb-style database with the same rows", async () => {
    // 1. A real Budgie database, exported with the real export code.
    const source = createDatabase();
    await seedSource(source);
    const original = await createPortableData(source, OPTS);
    expect(original.transactions).toHaveLength(1);

    // 2. Push every row to the sync server as the envelopes a client would send.
    const s = await createTestServer();
    const dev = await s.enrolDevice("alice");
    const envelopes = COLLECTIONS.flatMap(([tbl, collection]) =>
      ours(
        original[collection as keyof PortableData] as { publicId: string }[],
      ).map((row) => {
        const { pendingReconcileBalance, pendingReconcileDate, ...payload } =
          row as Record<string, unknown>;
        void pendingReconcileBalance;
        void pendingReconcileDate;
        return {
          tbl,
          publicId: row.publicId,
          hlc: hlc(T0),
          deleted: (payload.deletedAt ?? null) !== null,
          payload,
        };
      }),
    );
    expect(envelopes).toHaveLength(9);
    const pushed = await sync(s, dev.token, envelopes);
    expect(pushed.body.rejected).toEqual([]);

    // 3. Build the snapshot and run it through the real validator and importer.
    const text = (await buildSnapshot(s.executor, dev.userId, T0))!;
    const snapshot = await parsePortableData(text);
    const target = createDatabase();
    await importPortableData(target, snapshot);
    const imported = await createPortableData(target, OPTS);

    // 4. Same rows (public ids, fields, relationships, tombstones).
    for (const [, collection] of COLLECTIONS) {
      const key = collection as keyof PortableData;
      expect(
        sortById(ours(imported[key] as { publicId: string }[])),
        collection,
      ).toEqual(sortById(ours(original[key] as { publicId: string }[])));
    }
    expect(
      imported.accounts.find((a) => a.publicId === uuid(2))?.deletedAt,
    ).not.toBeNull();
  });
});
