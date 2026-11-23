import type { DatabaseCapability } from "@/platform/database";
import {
  MissingReferenceError,
  applyPortableRow,
  loadPublicIdLookup,
  resolveSecondPassReferences,
  toPortableRow,
  type PortableCategory,
  type PortableTransaction,
} from "@/services/portable-data";
import {
  applySyncRow,
  encodeSyncRow,
  resolveSyncSecondPass,
} from "@/services/sync/codec";
import {
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
