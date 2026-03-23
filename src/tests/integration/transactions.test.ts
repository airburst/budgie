import { computeRunningBalances } from "@/lib/balances";
import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  EXPECTED,
  TRANSACTIONS_A,
  TRANSACTIONS_B,
} from "./helpers/fixtures";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

describe("transactions IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  let accountAId: number;
  let accountBId: number;
  const txnAIds: number[] = [];

  it("set up accounts and insert fixture transactions", async () => {
    const [a] = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_A);
    accountAId = a.id;
    const [b] = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_B);
    accountBId = b.id;

    for (const t of TRANSACTIONS_A) {
      const [row] = await invoke<{ id: number }[]>("transactions:create", {
        ...t,
        accountId: accountAId,
      });
      txnAIds.push(row.id);
    }
    for (const t of TRANSACTIONS_B) {
      await invoke("transactions:create", { ...t, accountId: accountBId });
    }
  });

  it("getByAccount returns all Account A transactions", async () => {
    const txns = await invoke<unknown[]>(
      "transactions:getByAccount",
      accountAId,
    );
    expect(txns).toHaveLength(TRANSACTIONS_A.length);
  });

  it("getByAccount excludes Account B transactions (isolation)", async () => {
    const txnsA = await invoke<{ accountId: number }[]>(
      "transactions:getByAccount",
      accountAId,
    );
    expect(txnsA.every((t) => t.accountId === accountAId)).toBe(true);

    const txnsB = await invoke<{ accountId: number }[]>(
      "transactions:getByAccount",
      accountBId,
    );
    expect(txnsB.every((t) => t.accountId === accountBId)).toBe(true);
    expect(txnsB).toHaveLength(TRANSACTIONS_B.length);
  });

  it("Account A computedBalance = 4611.70", async () => {
    const a = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    expect(a.computedBalance).toBeCloseTo(EXPECTED.ACCOUNT_A_COMPUTED, 2);
  });

  it("Account A clearedBalance = 4702.20", async () => {
    const a = await invoke<{ clearedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    expect(a.clearedBalance).toBeCloseTo(EXPECTED.ACCOUNT_A_CLEARED, 2);
  });

  it("clearing one uncleared transaction increases clearedBalance", async () => {
    // txnAIds[5] = "Pending Purchase" -78.00 (uncleared)
    const pendingPurchaseId = txnAIds[5];
    await invoke("transactions:update", pendingPurchaseId, { cleared: true });

    const a = await invoke<{ clearedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    // clearedBalance should now include the -78.00 transaction
    expect(a.clearedBalance).toBeCloseTo(EXPECTED.ACCOUNT_A_CLEARED - 78, 2);
  });

  it("deleting one transaction adjusts computedBalance", async () => {
    // txnAIds[1] = "Groceries" -250.00 (cleared)
    const groceriesId = txnAIds[1];
    await invoke("transactions:delete", groceriesId);

    const a = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    // Removing -250 increases balance by 250
    expect(a.computedBalance).toBeCloseTo(EXPECTED.ACCOUNT_A_COMPUTED + 250, 2);
  });

  it("computeRunningBalances produces correct per-row running totals", async () => {
    // Fetch remaining Account A transactions (after deleting Groceries above)
    const txns = await invoke<{ id: number; date: string; amount: number }[]>(
      "transactions:getByAccount",
      accountAId,
    );
    const map = computeRunningBalances(txns, ACCOUNT_A.balance);

    // Verify the map has entries for every returned transaction
    expect(map.size).toBe(txns.length);

    // Accumulate manually to verify final entry equals known computedBalance
    let running = ACCOUNT_A.balance;
    const sorted = [...txns].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
    );
    for (const t of sorted) {
      running += t.amount;
    }
    const lastTx = sorted[sorted.length - 1];
    expect(map.get(lastTx.id)).toBeCloseTo(running, 2);
  });
});

describe("transfer category change on update", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  let accountAId: number;
  let accountBId: number;
  let transferCategoryId: number; // Transfer > Savings Account (target = B)

  it("set up two accounts", async () => {
    const [a] = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_A);
    accountAId = a.id;
    const [b] = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_B);
    accountBId = b.id;

    // Find the Transfer > Savings Account sub-category (created when account B is added)
    const cats =
      await invoke<{ id: number; name: string; parentId: number | null }[]>(
        "categories:getAll",
      );
    const tc = cats.find(
      (c) => c.name === ACCOUNT_B.name && c.parentId !== null,
    );
    expect(tc).toBeDefined();
    transferCategoryId = tc!.id;
  });

  it("updating a past transaction's category to a transfer creates a mirror in the target account", async () => {
    // Create a plain transaction in account A (no category / not a transfer)
    const [tx] = await invoke<
      { id: number; transferTransactionId: number | null }[]
    >("transactions:create", {
      accountId: accountAId,
      date: "2026-01-15",
      payee: "Old Expense",
      amount: -200,
      cleared: true,
      notes: null,
    });
    expect(tx.transferTransactionId).toBeNull();

    // Change the category to a transfer sub-category
    const [updated] = await invoke<
      { id: number; transferTransactionId: number | null }[]
    >("transactions:update", tx.id, { categoryId: transferCategoryId });

    expect(updated.transferTransactionId).not.toBeNull();

    // A mirror transaction should now appear in account B
    const txnsB = await invoke<
      {
        id: number;
        accountId: number;
        amount: number;
        transferTransactionId: number | null;
      }[]
    >("transactions:getByAccount", accountBId);

    const mirror = txnsB.find((t) => t.transferTransactionId === updated.id);
    expect(mirror).toBeDefined();
    expect(mirror!.accountId).toBe(accountBId);
    expect(mirror!.amount).toBeCloseTo(200, 2); // negated
    expect(updated.transferTransactionId).toBe(mirror!.id);
  });

  it("updating a transfer transaction's category to a different transfer moves the mirror", async () => {
    // Create a third account so we can switch the transfer destination
    const accountC = {
      name: "Third Account",
      type: "bank" as const,
      balance: 0,
    };
    const [c] = await invoke<{ id: number }[]>("accounts:create", accountC);
    const accountCId = c.id;

    // Find Transfer > Third Account sub-category
    const cats =
      await invoke<{ id: number; name: string; parentId: number | null }[]>(
        "categories:getAll",
      );
    const tcC = cats.find(
      (cat) => cat.name === accountC.name && cat.parentId !== null,
    );
    expect(tcC).toBeDefined();
    const transferToCId = tcC!.id;

    // Create a transfer transaction from A → B
    const [tx] = await invoke<
      { id: number; transferTransactionId: number | null }[]
    >("transactions:create", {
      accountId: accountAId,
      categoryId: transferCategoryId,
      date: "2026-02-01",
      payee: "Transfer",
      amount: -100,
      cleared: false,
      notes: null,
    });
    expect(tx.transferTransactionId).not.toBeNull();
    const oldMirrorId = tx.transferTransactionId!;

    // Switch the transfer destination to account C
    const [updated] = await invoke<
      { id: number; transferTransactionId: number | null }[]
    >("transactions:update", tx.id, { categoryId: transferToCId });

    // Old mirror in B should be gone
    const txnsB = await invoke<{ id: number }[]>(
      "transactions:getByAccount",
      accountBId,
    );
    expect(txnsB.find((t) => t.id === oldMirrorId)).toBeUndefined();

    // New mirror should exist in C
    const txnsC = await invoke<
      { id: number; accountId: number; transferTransactionId: number | null }[]
    >("transactions:getByAccount", accountCId);
    const newMirror = txnsC.find((t) => t.transferTransactionId === updated.id);
    expect(newMirror).toBeDefined();
    expect(updated.transferTransactionId).toBe(newMirror!.id);
  });

  it("updating a transfer transaction's category to a non-transfer removes the mirror", async () => {
    // Find a non-transfer category
    const cats =
      await invoke<
        {
          id: number;
          name: string;
          expenseType: string;
          parentId: number | null;
        }[]
      >("categories:getAll");
    const expenseCat = cats.find(
      (c) => c.expenseType === "expense" && c.parentId !== null,
    );
    expect(expenseCat).toBeDefined();

    // Create a transfer transaction from A → B
    const [tx] = await invoke<
      { id: number; transferTransactionId: number | null }[]
    >("transactions:create", {
      accountId: accountAId,
      categoryId: transferCategoryId,
      date: "2026-02-10",
      payee: "Transfer To Remove",
      amount: -50,
      cleared: false,
      notes: null,
    });
    expect(tx.transferTransactionId).not.toBeNull();
    const mirrorId = tx.transferTransactionId!;

    // Change category to a regular expense
    const [updated] = await invoke<
      { id: number; transferTransactionId: number | null }[]
    >("transactions:update", tx.id, { categoryId: expenseCat!.id });

    expect(updated.transferTransactionId).toBeNull();

    // Mirror should no longer exist
    const mirror = await invoke<unknown>("transactions:getById", mirrorId);
    expect(mirror).toBeNull();
  });
});
