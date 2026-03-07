import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import {
  ACCOUNT_A,
  RECONCILE_FEB,
  RECONCILE_JAN,
  TRANSACTIONS_A,
} from "./helpers/fixtures";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

// ─── Main reconciliation tests (sequential, shared DB) ────────────────────────

describe("transactions:reconcile IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);
  afterAll(() => teardown());

  let accountId: number;
  const txIds: number[] = [];

  it("setup: create account and insert fixture transactions", async () => {
    const [a] = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_A);
    accountId = a.id;
    for (const t of TRANSACTIONS_A) {
      const [row] = await invoke<{ id: number }[]>("transactions:create", {
        ...t,
        accountId,
      });
      txIds.push(row.id);
    }
    expect(txIds).toHaveLength(TRANSACTIONS_A.length);
  });

  it("no account_reconciliation record is created if reconcile is never invoked", async () => {
    const records = await invoke<unknown[]>(
      "account_reconciliations:getByAccount",
      accountId,
    );
    expect(records).toHaveLength(0);
  });

  it("computedBalance and clearedBalance are unchanged after reconciliation", async () => {
    const before = await invoke<{
      computedBalance: number;
      clearedBalance: number;
    }>("accounts:getById", accountId);

    // Reconcile Jan transactions (txIds[0] = Salary Jan, txIds[1] = Groceries)
    await invoke("transactions:reconcile", {
      toReconcile: [txIds[0], txIds[1]],
      toUnclear: [],
      checkpoint: {
        accountId,
        date: RECONCILE_JAN.date,
        balance: RECONCILE_JAN.balance,
        notes: null,
      },
    });

    const after = await invoke<{
      computedBalance: number;
      clearedBalance: number;
    }>("accounts:getById", accountId);

    expect(after.computedBalance).toBeCloseTo(before.computedBalance, 2);
    expect(after.clearedBalance).toBeCloseTo(before.clearedBalance, 2);
  });

  it("marks toReconcile transactions as cleared=true, reconciled=true", async () => {
    // txIds[0] and txIds[1] were reconciled by the previous test
    const tx0 = await invoke<{ cleared: boolean; reconciled: boolean }>(
      "transactions:getById",
      txIds[0],
    );
    const tx1 = await invoke<{ cleared: boolean; reconciled: boolean }>(
      "transactions:getById",
      txIds[1],
    );
    expect(tx0.cleared).toBe(true);
    expect(tx0.reconciled).toBe(true);
    expect(tx1.cleared).toBe(true);
    expect(tx1.reconciled).toBe(true);
  });

  it("creates an account_reconciliation checkpoint with correct fields", async () => {
    const records = await invoke<
      { date: string; balance: number; accountId: number }[]
    >("account_reconciliations:getByAccount", accountId);
    expect(records).toHaveLength(1);
    expect(records[0].date).toBe(RECONCILE_JAN.date);
    expect(records[0].balance).toBeCloseTo(RECONCILE_JAN.balance, 2);
    expect(records[0].accountId).toBe(accountId);
  });

  it("accounts:getById returns updated lastReconcileDate and lastReconcileBalance", async () => {
    const account = await invoke<{
      lastReconcileDate: string;
      lastReconcileBalance: number;
    }>("accounts:getById", accountId);
    expect(account.lastReconcileDate).toBe(RECONCILE_JAN.date);
    expect(account.lastReconcileBalance).toBeCloseTo(RECONCILE_JAN.balance, 2);
  });

  it("reverts toUnclear transactions to cleared=false, reconciled=false", async () => {
    // txIds[3] (Rent) is currently cleared=true, reconciled=false
    // Reconcile txIds[2] (Salary Feb) but revert txIds[3] (Rent) to uncleared
    await invoke("transactions:reconcile", {
      toReconcile: [txIds[2]],
      toUnclear: [txIds[3]],
      checkpoint: {
        accountId,
        date: "2026-02-15",
        balance: 5750,
        notes: null,
      },
    });
    const tx3 = await invoke<{ cleared: boolean; reconciled: boolean }>(
      "transactions:getById",
      txIds[3],
    );
    expect(tx3.cleared).toBe(false);
    expect(tx3.reconciled).toBe(false);
  });

  it("second reconciliation: lastReconcileDate and lastReconcileBalance reflect latest checkpoint", async () => {
    // Reconcile txIds[4] (Utilities) with the Feb checkpoint
    await invoke("transactions:reconcile", {
      toReconcile: [txIds[4]],
      toUnclear: [],
      checkpoint: {
        accountId,
        date: RECONCILE_FEB.date,
        balance: RECONCILE_FEB.balance,
        notes: null,
      },
    });

    const account = await invoke<{
      lastReconcileDate: string;
      lastReconcileBalance: number;
    }>("accounts:getById", accountId);
    expect(account.lastReconcileDate).toBe(RECONCILE_FEB.date);
    expect(account.lastReconcileBalance).toBeCloseTo(RECONCILE_FEB.balance, 2);

    // Three checkpoint records should now exist
    const records = await invoke<unknown[]>(
      "account_reconciliations:getByAccount",
      accountId,
    );
    expect(records).toHaveLength(3);
  });

  it("transactions:update throws on a reconciled transaction", async () => {
    // txIds[0] is reconciled — update should be rejected
    await expect(
      invoke("transactions:update", txIds[0], { notes: "attempted edit" }),
    ).rejects.toThrow();

    // Field must be unchanged
    const tx = await invoke<{ notes: string | null }>(
      "transactions:getById",
      txIds[0],
    );
    expect(tx.notes).toBeNull();
  });

  it("transactions:delete throws on a reconciled transaction", async () => {
    // txIds[0] is reconciled — delete should be rejected
    await expect(invoke("transactions:delete", txIds[0])).rejects.toThrow();

    // Row must still exist
    const all = await invoke<{ id: number }[]>(
      "transactions:getByAccount",
      accountId,
    );
    expect(all.some((t) => t.id === txIds[0])).toBe(true);
  });
});

// ─── Atomicity test (isolated DB) ─────────────────────────────────────────────

describe("transactions:reconcile atomicity", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);
  afterAll(() => teardown());

  it("all writes roll back if the checkpoint insert fails", async () => {
    // Create account and a cleared transaction
    const [a] = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_A);
    const [tx] = await invoke<{ id: number }[]>("transactions:create", {
      ...TRANSACTIONS_A[0],
      accountId: a.id,
    });

    // Provide a checkpoint with no `date` field — violates the NOT NULL constraint
    // on account_reconciliations.date, causing the INSERT to fail.
    await expect(
      invoke("transactions:reconcile", {
        toReconcile: [tx.id],
        toUnclear: [],
         
        checkpoint: { accountId: a.id, balance: 100, notes: null } as any,
      }),
    ).rejects.toThrow();

    // The UPDATE to transactions.reconciled must have been rolled back
    const found = await invoke<{ reconciled: boolean }>(
      "transactions:getById",
      tx.id,
    );
    expect(found.reconciled).toBe(false);
  });
});
