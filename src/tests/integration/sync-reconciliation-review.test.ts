// SY-030: accounts whose reconciliation no longer adds up after a sync are
// returned by the cycle (SPEC.md 8.11), on the multi-client harness.
import { reconcileTransactions } from "@/services/reconciliation";
import {
  createSyncHarness,
  type SyncHarness,
  type SyncHarnessClient,
} from "@/tests/helpers/sync-harness";
import { afterEach, describe, expect, it, vi } from "vitest";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

const setup = async () => {
  harness = await createSyncHarness();
  return harness.clients as [SyncHarnessClient, SyncHarnessClient];
};

const timestamp = (offsetMs: number) =>
  new Date(vi.getRealSystemTime() + offsetMs)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

/** An account (opening balance 100) with one transaction per amount. */
const seedAccount = async (client: SyncHarnessClient, amounts: number[]) => {
  const [account] = await client.services.accounts.create({
    name: "Current",
    number: null,
    type: "bank",
    balance: 100,
    currency: "GBP",
    notes: null,
    interestRate: null,
    creditLimit: null,
    pendingReconcileBalance: null,
    pendingReconcileDate: null,
  });
  if (!account) throw new Error("account not created");
  const transactions: Array<{ id: number; publicId: string }> = [];
  for (const [i, amount] of amounts.entries()) {
    const [row] = await client.services.transactions.create({
      accountId: account.id,
      categoryId: null,
      date: "2026-11-20",
      payee: `Payee ${i}`,
      amount,
      notes: null,
      cleared: false,
    });
    if (!row) throw new Error("transaction not created");
    transactions.push({
      id: row.id,
      publicId: await client.publicIdOf("transactions", row.id),
    });
  }
  return {
    id: account.id,
    publicId: await client.publicIdOf("accounts", account.id),
    transactions,
  };
};

const reconcile = (
  client: SyncHarnessClient,
  accountId: number,
  ids: number[],
  balance: number,
) =>
  reconcileTransactions(client.database, {
    toReconcile: ids,
    toUnclear: [],
    checkpoint: { accountId, date: "2026-11-21", balance, notes: null },
  });

describe("reconciliation review", () => {
  it("is empty without a reconciliation and after a clean one", async () => {
    const [a, b] = await setup();
    const account = await seedAccount(a, [-10, -20, -30]);
    expect((await a.sync()).reconciliationReview).toEqual([]);

    // Opening 100, minus the first two: 70.
    const [first, second] = account.transactions;
    await reconcile(a, account.id, [first!.id, second!.id], 70);
    expect((await a.sync()).reconciliationReview).toEqual([]);
    expect((await b.sync()).reconciliationReview).toEqual([]);
  });

  it("compares to the penny, not with raw float equality", async () => {
    const [a] = await setup();
    const account = await seedAccount(a, [0.1, 0.2]);
    await reconcile(a, account.id, account.transactions.map((t) => t.id), 100.3);
    // 100 + 0.1 + 0.2 is 100.30000000000001 in floating point.
    expect((await a.sync()).reconciliationReview).toEqual([]);
  });

  it("flags the account on both devices when an included transaction is edited offline, repairs nothing, and clears when totals agree", async () => {
    const [a, b] = await setup();
    const account = await seedAccount(a, [-10, -20, -30]);
    await a.sync();
    await b.sync();

    const [first, second] = account.transactions;
    await reconcile(a, account.id, [first!.id, second!.id], 70);
    // B edits an included transaction offline, later than A's reconcile.
    await b.database.execute({
      sql: "UPDATE transactions SET amount = ?, updated_at = ? WHERE public_id = ?",
      params: [-25, timestamp(60_000), second!.publicId],
    });

    const aFirst = await a.sync();
    expect(aFirst.reconciliationReview).toEqual([]);
    const bResult = await b.sync();
    expect(bResult.reconciliationReview).toEqual([account.publicId]);
    const aResult = await a.sync();
    expect(aResult.reconciliationReview).toEqual([account.publicId]);

    // Nothing was repaired: the checkpoint is as reconciled and not dirty.
    for (const client of [a, b]) {
      const [checkpoint] = await client.database.query<{
        balance: number;
        sync_dirty: number;
      }>({
        sql: "SELECT balance, sync_dirty FROM account_reconciliations",
      });
      expect(checkpoint).toEqual({ balance: 70, sync_dirty: 0 });
    }

    // The flag stays while the totals disagree, and clears when they agree:
    // restore the amount and reconcile the transaction again on A.
    expect((await a.sync()).reconciliationReview).toEqual([account.publicId]);
    await a.database.execute({
      sql: "UPDATE transactions SET amount = ?, reconciled = 1, updated_at = ? WHERE public_id = ?",
      params: [-20, timestamp(120_000), second!.publicId],
    });
    expect((await a.sync()).reconciliationReview).toEqual([]);
    expect((await b.sync()).reconciliationReview).toEqual([]);
  });

  it("ignores deleted accounts and deleted checkpoints", async () => {
    const [a] = await setup();
    const account = await seedAccount(a, [-10]);
    await reconcile(a, account.id, [], 999);
    expect((await a.sync()).reconciliationReview).toEqual([account.publicId]);
    await a.database.execute({
      sql: "UPDATE account_reconciliations SET deleted_at = CURRENT_TIMESTAMP",
    });
    expect((await a.sync()).reconciliationReview).toEqual([]);
  });
});
