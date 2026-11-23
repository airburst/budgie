// SY-045: a BudgieMac export (format 1, with `bankText` on transactions and a
// top-level `budgieMacImportRules`) imports into the web database. Unknown keys
// are ignored, public ids stay the Mac's UUIDs, and Start (sync on) rewrites
// none of them.
import {
  createPortableData,
  PORTABLE_COLLECTIONS,
  PORTABLE_TABLES,
  type PortableData,
} from "@/services/portable-data";
import { importPortableData } from "@/services/portable-import";
import { prepareStart } from "@/services/sync/start";
import fixture from "@/tests/fixtures/budgiemac-export-v1.json";
import { createCapabilityDatabase } from "@/tests/helpers/portable-fixture";
import { afterEach, describe, expect, it } from "vitest";

let close: (() => void) | undefined;
afterEach(() => {
  close?.();
  close = undefined;
});

const COLLECTIONS = Object.values(PORTABLE_COLLECTIONS);
const EXPORT_OPTIONS = {
  applicationVersion: "1.0.0",
  minimumReaderVersion: "1.0.0",
};

const importFixture = async () => {
  const created = createCapabilityDatabase();
  close = created.close;
  await importPortableData(created.database, structuredClone(fixture));
  return created.database;
};

const live = (data: PortableData, collection: (typeof COLLECTIONS)[number]) =>
  (data[collection] as Array<{ publicId: string; deletedAt: string | null }>)
    .filter((row) => row.deletedAt === null)
    .sort((a, b) => a.publicId.localeCompare(b.publicId));

describe("BudgieMac export import (SY-045)", () => {
  it("imports, with every public id the Mac's UUID and counts matching", async () => {
    const database = await importFixture();
    const exported = await createPortableData(database, EXPORT_OPTIONS);
    for (const collection of COLLECTIONS) {
      const expected = (
        fixture[collection as keyof typeof fixture] as Array<{
          publicId: string;
        }>
      )
        .map((row) => row.publicId)
        .sort();
      expect(
        live(exported, collection).map((row) => row.publicId),
        collection,
      ).toEqual(expected);
    }
    // Nothing is held under another id: every live row in the database is a
    // fixture row (the seeded legacy categories are deleted by the import).
    for (const table of PORTABLE_TABLES) {
      const [count] = await database.query<{ count: number }>({
        sql: `SELECT COUNT(*) AS count FROM ${table} WHERE deleted_at IS NULL`,
      });
      const rows = fixture[
        PORTABLE_COLLECTIONS[table] as keyof typeof fixture
      ] as unknown[];
      expect(Number(count?.count), table).toBe(rows.length);
    }
  });

  it("ignores bankText and budgieMacImportRules", async () => {
    const database = await importFixture();
    const exported = await createPortableData(database, EXPORT_OPTIONS);
    expect(exported).not.toHaveProperty("budgieMacImportRules");
    for (const row of exported.transactions) {
      expect(row).not.toHaveProperty("bankText");
    }
    const columns = await database.query<{ name: string }>({
      sql: "PRAGMA table_info(transactions)",
    });
    expect(columns.map((column) => column.name)).not.toContain("bank_text");
  });

  it("links transfers, category parents and preferences correctly", async () => {
    const database = await importFixture();
    const exported = await createPortableData(database, EXPORT_OPTIONS);

    const byId = <T extends { publicId: string }>(rows: T[]) =>
      new Map(rows.map((row) => [row.publicId, row]));
    const source = {
      accounts: byId(fixture.accounts),
      categories: byId(fixture.categories),
      transactions: byId(fixture.transactions),
    };
    const got = {
      accounts: byId(live(exported, "accounts") as never[]),
      categories: byId(live(exported, "categories") as never[]),
      transactions: byId(live(exported, "transactions") as never[]),
    };

    for (const [id, want] of source.transactions) {
      const row = got.transactions.get(id) as
        (typeof fixture.transactions)[number] | undefined;
      expect(row?.transferTransactionPublicId).toBe(
        want.transferTransactionPublicId,
      );
      expect(row?.accountPublicId).toBe(want.accountPublicId);
      expect(row?.categoryPublicId).toBe(want.categoryPublicId);
    }
    expect(
      [...source.transactions.values()].filter(
        (row) => row.transferTransactionPublicId,
      ),
    ).toHaveLength(2);

    for (const [id, want] of source.categories) {
      const row = got.categories.get(id) as
        (typeof fixture.categories)[number] | undefined;
      expect(row?.parentPublicId).toBe(want.parentPublicId);
    }
    for (const [id, want] of source.accounts) {
      const row = got.accounts.get(id) as
        (typeof fixture.accounts)[number] | undefined;
      expect(row?.pendingReconcileBalance).toBe(want.pendingReconcileBalance);
      expect(row?.pendingReconcileDate).toBe(want.pendingReconcileDate);
    }

    // Shortcuts point at the right local accounts.
    const [settings] = await database.query<{ preferences: string }>({
      sql: "SELECT preferences FROM settings WHERE id = 1",
    });
    const stored = JSON.parse(settings?.preferences ?? "{}") as {
      accountShortcuts: Array<{
        key: string;
        ctrl: boolean;
        accountId: number;
      }>;
      hideReconciled: boolean;
      theme: string;
      startupPage: string;
    };
    const accounts = await database.query<{ id: number; public_id: string }>({
      sql: "SELECT id, public_id FROM accounts WHERE deleted_at IS NULL",
    });
    const publicOf = (id: number) =>
      accounts.find((account) => account.id === id)?.public_id;
    expect(
      stored.accountShortcuts.map((shortcut) => ({
        key: shortcut.key,
        ctrl: shortcut.ctrl,
        publicId: publicOf(shortcut.accountId),
      })),
    ).toEqual(
      fixture.preferences.accountShortcuts.map((shortcut) => ({
        key: shortcut.key,
        ctrl: shortcut.ctrl,
        publicId: shortcut.accountPublicId,
      })),
    );
    expect(stored.hideReconciled).toBe(true);
    expect(stored.theme).toBe("dark");
    expect(stored.startupPage).toBe("/accounts");
    // Mac's account order is carried through the preferences unchanged.
    expect(exported.preferences).toEqual(fixture.preferences);
  });

  it("re-exports the same rows", async () => {
    const database = await importFixture();
    const exported = await createPortableData(database, EXPORT_OPTIONS);
    for (const collection of COLLECTIONS) {
      expect(live(exported, collection), collection).toEqual(
        [
          ...(fixture[collection as keyof typeof fixture] as Array<{
            publicId: string;
          }>),
        ]
          .map((row) => {
            // `bankText` is not carried: Budgie has no column for it.
            const { bankText: _bankText, ...rest } = row as Record<
              string,
              unknown
            > & { publicId: string };
            return rest as { publicId: string };
          })
          .sort((a, b) => a.publicId.localeCompare(b.publicId)),
      );
    }
  });

  it("starts sync without rewriting any public id", async () => {
    const database = await importFixture();
    const before = await database.query<{ public_id: string }>({
      sql: PORTABLE_TABLES.map(
        (table) => `SELECT public_id FROM ${table} WHERE deleted_at IS NULL`,
      ).join(" UNION ALL "),
    });
    const prepared = await prepareStart(database, {
      now: () => Date.parse("2026-11-22T00:00:00.000Z"),
    });
    // Only the web's own seeded `legacy:` categories, which the import
    // deleted, get new ids. No imported (live) row is touched.
    const [legacy] = await database.query<{ count: number }>({
      sql: "SELECT COUNT(*) AS count FROM categories WHERE deleted_at IS NOT NULL",
    });
    expect(prepared.rewrittenIds).toEqual(
      Object.fromEntries(
        PORTABLE_TABLES.map((table) => [
          table,
          table === "categories" ? Number(legacy?.count) : 0,
        ]),
      ),
    );
    const after = await database.query<{ public_id: string }>({
      sql: PORTABLE_TABLES.map(
        (table) => `SELECT public_id FROM ${table} WHERE deleted_at IS NULL`,
      ).join(" UNION ALL "),
    });
    expect(after.map((row) => row.public_id).sort()).toEqual(
      before.map((row) => row.public_id).sort(),
    );
    const [state] = await database.query<{ enabled: number; cursor: string }>({
      sql: "SELECT enabled, cursor FROM sync_state WHERE id = 1",
    });
    expect(state).toMatchObject({ enabled: 1, cursor: "0" });
  });
});
