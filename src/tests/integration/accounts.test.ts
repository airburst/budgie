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

describe("accounts IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  let accountAId: number;
  let accountBId: number;

  it("getAll returns empty array on fresh DB", async () => {
    const result = await invoke<unknown[]>("accounts:getAll");
    expect(result).toEqual([]);
  });

  it("create Account A — getById returns matching fields", async () => {
    const rows = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_A);
    accountAId = rows[0].id;
    const found = await invoke<{
      name: string;
      type: string;
      balance: number;
    }>("accounts:getById", accountAId);
    expect(found.name).toBe(ACCOUNT_A.name);
    expect(found.type).toBe(ACCOUNT_A.type);
    expect(found.balance).toBe(ACCOUNT_A.balance);
  });

  it("create Account B — getAll returns 2 rows", async () => {
    const rows = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_B);
    accountBId = rows[0].id;
    const all = await invoke<unknown[]>("accounts:getAll");
    expect(all).toHaveLength(2);
  });

  it("computedBalance equals opening balance when no transactions exist", async () => {
    const a = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    expect(a.computedBalance).toBe(ACCOUNT_A.balance);

    const b = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      accountBId,
    );
    expect(b.computedBalance).toBe(ACCOUNT_B.balance);
  });

  it("clearedBalance equals opening balance when no transactions exist", async () => {
    const a = await invoke<{ clearedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    expect(a.clearedBalance).toBe(ACCOUNT_A.balance);

    const b = await invoke<{ clearedBalance: number }>(
      "accounts:getById",
      accountBId,
    );
    expect(b.clearedBalance).toBe(ACCOUNT_B.balance);
  });

  it("insert fixture transactions for both accounts", async () => {
    for (const t of TRANSACTIONS_A) {
      await invoke("transactions:create", { ...t, accountId: accountAId });
    }
    for (const t of TRANSACTIONS_B) {
      await invoke("transactions:create", { ...t, accountId: accountBId });
    }
  });

  it("Account A computedBalance = 4611.70 after fixture transactions", async () => {
    const a = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    expect(a.computedBalance).toBeCloseTo(EXPECTED.ACCOUNT_A_COMPUTED, 2);
  });

  it("Account A clearedBalance = 4702.20 after fixture transactions", async () => {
    const a = await invoke<{ clearedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    expect(a.clearedBalance).toBeCloseTo(EXPECTED.ACCOUNT_A_CLEARED, 2);
  });

  it("Account B computedBalance = 6512.50 after fixture transactions", async () => {
    const b = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      accountBId,
    );
    expect(b.computedBalance).toBeCloseTo(EXPECTED.ACCOUNT_B_COMPUTED, 2);
  });

  it("update account name — getById reflects change", async () => {
    await invoke("accounts:update", accountAId, { name: "Renamed Account" });
    const a = await invoke<{ name: string }>("accounts:getById", accountAId);
    expect(a.name).toBe("Renamed Account");
  });

  it("delete Account B — getAll returns 1 row", async () => {
    // FK constraint: must delete linked transactions before deleting the account
    const txns = await invoke<{ id: number }[]>(
      "transactions:getByAccount",
      accountBId,
    );
    for (const t of txns) {
      await invoke("transactions:delete", t.id);
    }
    await invoke("accounts:delete", accountBId);
    const all = await invoke<unknown[]>("accounts:getAll");
    expect(all).toHaveLength(1);
  });
});
