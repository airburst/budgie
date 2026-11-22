import type { DatabaseCapability } from "@/platform/database";
import {
  MissingReferenceError,
  applyPortableRow,
  createPortableData,
  importPortableData,
  loadPublicIdLookup,
  resolveSecondPassReferences,
  sealPortableData,
  toPortableRow,
  type PortableCategory,
  type PortableData,
  type PortableTransaction,
} from "@/services/portable-data";
import {
  applySyncRow,
  encodeSyncRow,
  resolveSyncSecondPass,
} from "@/services/sync/codec";
import {
  PORTABLE_FIXTURE_OPTIONS,
  buildPortableFixtureDatabase,
  createCapabilityDatabase,
} from "@/tests/helpers/portable-fixture";
import { afterEach, describe, expect, it } from "vitest";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const fresh = (): DatabaseCapability => {
  const { database, close } = createCapabilityDatabase();
  closers.push(close);
  return database;
};

const fixture = async () => {
  const { database, close } = await buildPortableFixtureDatabase();
  closers.push(close);
  return database;
};

const stamps = {
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-02 00:00:00",
  deletedAt: null,
};

const category = (
  publicId: string,
  parentPublicId: string | null,
): PortableCategory => ({
  publicId,
  ...stamps,
  parentPublicId,
  name: publicId,
  expenseType: "expense",
  deleted: false,
});

const account = (publicId: string, name: string) => ({
  publicId,
  ...stamps,
  name,
  number: null,
  type: "bank",
  balance: 10,
  currency: "GBP",
  notes: null,
  interestRate: null,
  creditLimit: null,
  deleted: false,
  pendingReconcileBalance: null,
  pendingReconcileDate: null,
});

const transaction = (
  publicId: string,
  accountPublicId: string,
  transferTransactionPublicId: string | null = null,
): PortableTransaction => ({
  publicId,
  ...stamps,
  accountPublicId,
  categoryPublicId: null,
  date: "2026-03-01",
  payee: "P",
  amount: -5,
  notes: null,
  cleared: false,
  reconciled: false,
  transferTransactionPublicId,
});

describe("sync codec", () => {
  it("encodes accounts without the pending reconcile fields", async () => {
    const database = await fixture();
    await database.transaction(async (tx) => {
      const rows = await tx.query({
        sql: "SELECT * FROM accounts WHERE public_id = 'acc-current'",
      });
      const lookup = await loadPublicIdLookup(tx, "accounts", rows);
      const portable = toPortableRow("accounts", rows[0]!, lookup);
      expect(portable.pendingReconcileBalance).toBe(1301.25);
      const encoded = encodeSyncRow("accounts", rows[0]!, lookup);
      expect(encoded).not.toHaveProperty("pendingReconcileBalance");
      expect(encoded).not.toHaveProperty("pendingReconcileDate");
      expect(encoded.name).toBe("Current");
    });
  });

  it("applies accounts leaving local pending reconcile values alone", async () => {
    const database = await fixture();
    await database.transaction(async (tx) => {
      const { pendingReconcileBalance, pendingReconcileDate, ...payload } =
        account("acc-current", "Renamed");
      void pendingReconcileBalance;
      void pendingReconcileDate;
      await applySyncRow(tx, "accounts", payload);
      await applySyncRow(tx, "accounts", {
        ...account("acc-new", "Brand new"),
        pendingReconcileBalance: 99,
      });
    });
    const rows = await database.query<{
      public_id: string;
      name: string;
      pending_reconcile_balance: number | null;
      pending_reconcile_date: string | null;
    }>({
      sql: `SELECT public_id, name, pending_reconcile_balance, pending_reconcile_date
        FROM accounts WHERE public_id IN ('acc-current', 'acc-new') ORDER BY id`,
    });
    expect(rows).toEqual([
      {
        public_id: "acc-current",
        name: "Renamed",
        pending_reconcile_balance: 1301.25,
        pending_reconcile_date: "2026-02-28",
      },
      {
        public_id: "acc-new",
        name: "Brand new",
        pending_reconcile_balance: null,
        pending_reconcile_date: null,
      },
    ]);
  });

  it("ignores unknown fields", async () => {
    const database = fresh();
    await database.transaction(async (tx) => {
      await applyPortableRow(tx, "accounts", {
        ...account("acc-a", "A"),
        bankText: "BudgieMac only",
        somethingElse: { nested: true },
      } as never);
    });
    const [row] = await database.query({
      sql: "SELECT * FROM accounts WHERE public_id = 'acc-a'",
    });
    expect(row?.name).toBe("A");
    expect(Object.keys(row ?? {})).not.toContain("bank_text");
  });

  it("writes extra columns in the same statement", async () => {
    const database = fresh();
    await database.transaction(async (tx) => {
      await applyPortableRow(tx, "accounts", account("acc-a", "A"), {
        extraColumns: { notes: "from engine" },
      });
      await applyPortableRow(tx, "accounts", account("acc-a", "B"), {
        extraColumns: { notes: "again", currency: "EUR" },
      });
      await expect(
        applyPortableRow(tx, "accounts", account("acc-a", "C"), {
          extraColumns: { "notes; DROP TABLE accounts": 1 },
        }),
      ).rejects.toThrow("Invalid column");
    });
    const [row] = await database.query({
      sql: "SELECT name, notes, currency FROM accounts WHERE public_id = 'acc-a'",
    });
    expect(row).toEqual({ name: "B", notes: "again", currency: "EUR" });
  });
});

describe("missing references", () => {
  it("fails with a named error and writes nothing", async () => {
    const database = fresh();
    let caught: unknown;
    await database
      .transaction(async (tx) => {
        await applyPortableRow(tx, "accounts", account("acc-a", "A"));
        await applyPortableRow(tx, "transactions", transaction("tx-1", "nope"));
      })
      .catch((error: unknown) => {
        caught = error;
      });
    expect(caught).toBeInstanceOf(MissingReferenceError);
    const error = caught as MissingReferenceError;
    expect(error.code).toBe("missing_reference");
    expect(error.table).toBe("transactions");
    expect(error.publicId).toBe("tx-1");
    expect(error.field).toBe("accountPublicId");
    expect(error.message).toContain("missing_reference");
    const rows = await database.query({
      sql: "SELECT public_id FROM transactions WHERE public_id = 'tx-1'",
    });
    expect(rows).toEqual([]);
    // The enclosing transaction rolled back, so the account is gone too.
    expect(
      await database.query({
        sql: "SELECT 1 FROM accounts WHERE public_id = 'acc-a'",
      }),
    ).toEqual([]);
  });

  it("does not write a row whose reference is missing even without rollback", async () => {
    const database = fresh();
    await database.transaction(async (tx) => {
      await expect(
        applyPortableRow(tx, "transactions", transaction("tx-1", "nope")),
      ).rejects.toBeInstanceOf(MissingReferenceError);
      expect(
        await tx.query({
          sql: "SELECT 1 FROM transactions WHERE public_id = 'tx-1'",
        }),
      ).toEqual([]);
    });
  });

  it("never replaces a missing optional reference with null", async () => {
    const database = fresh();
    await database.transaction(async (tx) => {
      await applyPortableRow(tx, "accounts", account("acc-a", "A"));
      await expect(
        applyPortableRow(tx, "transactions", {
          ...transaction("tx-1", "acc-a"),
          categoryPublicId: "missing-category",
        }),
      ).rejects.toMatchObject({
        code: "missing_reference",
        field: "categoryPublicId",
      });
    });
  });
});

describe("second pass", () => {
  it("resolves category parents and transfer links after pass 1", async () => {
    const database = fresh();
    const child = category("child", "parent");
    const parent = category("parent", null);
    const tx1 = transaction("tx-1", "acc-a", "tx-2");
    const tx2 = transaction("tx-2", "acc-a", "tx-1");
    await database.transaction(async (tx) => {
      await applyPortableRow(tx, "accounts", account("acc-a", "A"));
      for (const row of [child, parent]) {
        await applyPortableRow(tx, "categories", row, {
          deferSecondPass: true,
        });
      }
      for (const row of [tx1, tx2]) {
        await applyPortableRow(tx, "transactions", row, {
          deferSecondPass: true,
        });
      }
      const pass1 = await tx.query({
        sql: "SELECT parent_id FROM categories WHERE public_id = 'child'",
      });
      expect(pass1[0]?.parent_id).toBeNull();
      for (const row of [child, parent]) {
        await resolveSecondPassReferences(tx, "categories", row);
      }
      for (const row of [tx1, tx2]) {
        await resolveSecondPassReferences(tx, "transactions", row);
      }
    });
    const links = await database.query({
      sql: `SELECT c.public_id AS child, p.public_id AS parent
        FROM categories c JOIN categories p ON p.id = c.parent_id
        WHERE c.public_id = 'child'`,
    });
    expect(links).toEqual([{ child: "child", parent: "parent" }]);
    const transfers = await database.query({
      sql: `SELECT a.public_id AS a, b.public_id AS b
        FROM transactions a JOIN transactions b ON b.id = a.transfer_transaction_id
        ORDER BY a.public_id`,
    });
    expect(transfers).toEqual([
      { a: "tx-1", b: "tx-2" },
      { a: "tx-2", b: "tx-1" },
    ]);
  });

  it("fails the second pass when the target never arrived", async () => {
    const database = fresh();
    await database.transaction(async (tx) => {
      const orphan = category("orphan", "ghost");
      await applySyncRow(tx, "categories", orphan);
      await expect(
        resolveSyncSecondPass(tx, "categories", orphan),
      ).rejects.toMatchObject({
        code: "missing_reference",
        table: "categories",
        publicId: "orphan",
        field: "parentPublicId",
      });
    });
  });
});

describe("portable import preferences", () => {
  const exportOf = async (
    database: DatabaseCapability,
  ): Promise<PortableData> =>
    createPortableData(database, PORTABLE_FIXTURE_OPTIONS);

  const settings = async (database: DatabaseCapability) => {
    const [row] = await database.query<{ preferences: string }>({
      sql: "SELECT preferences FROM settings WHERE id = 1",
    });
    return row?.preferences;
  };

  it("keeps the settings row when the package preferences are empty", async () => {
    const source = await fixture();
    const exported = await exportOf(source);
    const target = fresh();
    await importPortableData(target, exported);
    const stored = JSON.stringify({
      hideReconciled: false,
      backupFolder: "Mine",
    });
    await target.execute({
      sql: "UPDATE settings SET preferences = ? WHERE id = 1",
      params: [stored],
    });
    await importPortableData(
      target,
      await sealPortableData({ ...exported, preferences: {} }),
    );
    expect(await settings(target)).toBe(stored);
  });

  it("does not create a settings row from empty preferences", async () => {
    const source = await fixture();
    const exported = await sealPortableData({
      ...(await exportOf(source)),
      preferences: {},
    });
    const target = fresh();
    await importPortableData(target, exported);
    expect(await settings(target)).toBeUndefined();
  });

  it("replaces the settings when the package preferences are not empty", async () => {
    const source = await fixture();
    const exported = await exportOf(source);
    const target = fresh();
    await target.execute({
      sql: "INSERT INTO settings (id, preferences) VALUES (1, ?)",
      params: [JSON.stringify({ backupFolder: "Old" })],
    });
    await importPortableData(target, exported);
    const prefs = JSON.parse((await settings(target)) ?? "{}");
    expect(prefs.backupFolder).toBe("Café");
    const accounts = await target.query<{ id: number; public_id: string }>({
      sql: "SELECT id, public_id FROM accounts",
    });
    const byId = new Map(accounts.map((row) => [row.id, row.public_id]));
    expect(
      prefs.accountShortcuts.map(
        (shortcut: { key: string; accountId: number }) => [
          shortcut.key,
          byId.get(shortcut.accountId),
        ],
      ),
    ).toEqual([
      ["1", "acc-current"],
      ["2", "acc-savings"],
    ]);
  });

  it("drops kept shortcuts whose account no longer resolves, remapping the rest", async () => {
    const source = await fixture();
    const exported = await exportOf(source);
    const target = fresh();
    await importPortableData(target, exported);
    const idOf = async (publicId: string) =>
      (
        await target.query<{ id: number }>({
          sql: "SELECT id FROM accounts WHERE public_id = ?",
          params: [publicId],
        })
      )[0]!.id;
    await target.execute({
      sql: "UPDATE settings SET preferences = ? WHERE id = 1",
      params: [
        JSON.stringify({
          backupFolder: "Mine",
          accountShortcuts: [
            { key: "1", accountId: await idOf("acc-current") },
            { key: "2", ctrl: true, accountId: await idOf("acc-savings") },
            { key: "3", accountId: 9999 },
          ],
        }),
      ],
    });
    // The new package no longer has the savings account.
    const smaller = await sealPortableData({
      ...exported,
      preferences: {},
      accounts: exported.accounts.filter(
        (row) => row.publicId !== "acc-savings",
      ),
      transactions: exported.transactions
        .filter((row) => row.accountPublicId !== "acc-savings")
        .map((row) => ({ ...row, transferTransactionPublicId: null })),
      scheduledTransactions: [],
    });
    await importPortableData(target, smaller);
    const prefs = JSON.parse((await settings(target)) ?? "{}");
    expect(prefs.backupFolder).toBe("Mine");
    expect(prefs.accountShortcuts).toEqual([
      { key: "1", accountId: await idOf("acc-current") },
    ]);
  });
});
