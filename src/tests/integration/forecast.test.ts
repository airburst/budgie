import type { ForecastScheduled, ForecastTransaction } from "@/lib/forecast";
import { buildForecastRows } from "@/lib/forecast";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  EXPECTED,
  SCHEDULED_A,
  SCHEDULED_B,
  TRANSACTIONS_A,
  TRANSACTIONS_B,
} from "./helpers/fixtures";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

const TODAY = "2026-03-07";
const END_3M = "2026-06-07";
const END_6M = "2026-09-07";
const END_12M = "2027-03-07";

// Uncleared transaction amounts (sum = -90.50)
const UNCLEARED_SUM = -90.5; // -78 + -12.50

describe("forecast workflow", () => {
  const testDb = createTestDb();
  const { db, schema, teardown } = testDb;
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  let accountAId: number;
  let accountBId: number;
  const txnAIds: number[] = [];
  const schedAIds: number[] = [];

  // Helper: get forecast rows + end balance for an account
  async function forecast(acctId: number, end: string) {
    const acct = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      acctId,
    );
    const txns = await invoke<ForecastTransaction[]>(
      "transactions:getByAccount",
      acctId,
    );
    const sched = await invoke<ForecastScheduled[]>(
      "scheduled_transactions:getAll",
    );
    const rows = buildForecastRows(txns, sched, acctId, TODAY, end);
    return {
      rows,
      endBalance: rows.reduce((sum, r) => sum + r.amount, acct.computedBalance),
    };
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
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
    for (const s of SCHEDULED_A) {
      const [row] = await invoke<{ id: number }[]>(
        "scheduled_transactions:create",
        { ...s, accountId: accountAId },
      );
      schedAIds.push(row.id);
    }
    for (const s of SCHEDULED_B) {
      await invoke("scheduled_transactions:create", {
        ...s,
        accountId: accountBId,
      });
    }
  });

  // ── Section 1 — Baseline balances ─────────────────────────────────────────

  it("S1: Account A computedBalance = 4611.70", async () => {
    const a = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    expect(a.computedBalance).toBeCloseTo(EXPECTED.ACCOUNT_A_COMPUTED, 2);
  });

  it("S1: Account B computedBalance = 6512.50", async () => {
    const b = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      accountBId,
    );
    expect(b.computedBalance).toBeCloseTo(EXPECTED.ACCOUNT_B_COMPUTED, 2);
  });

  // ── Section 2 — 3-month forecast ──────────────────────────────────────────

  it("S2: Monthly Salary has exactly 3 rows in 3-month window", async () => {
    const { rows } = await forecast(accountAId, END_3M);
    const salaryRows = rows.filter((r) => r.payee === "Monthly Salary");
    expect(salaryRows).toHaveLength(3);
    expect(salaryRows.map((r) => r.date)).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });

  it("S2: Dentist does NOT appear in 3-month window (Jul 15 > Jun 7)", async () => {
    const { rows } = await forecast(accountAId, END_3M);
    expect(rows.some((r) => r.payee === "Dentist")).toBe(false);
  });

  it("S2: 3-month end balance is correct", async () => {
    // Base 4611.70 + Salary(3×2500) + Gym(13×-45) + StandingOrder(3×-200)
    //    + CouncilTax(3×-150) + Netflix(1×-12.99) = 10463.71
    const { endBalance } = await forecast(accountAId, END_3M);
    expect(endBalance).toBeCloseTo(10463.71, 1);
  });

  // ── Section 3 — 6-month forecast ──────────────────────────────────────────

  it("S3: Dentist appears exactly once in 6-month window", async () => {
    const { rows } = await forecast(accountAId, END_6M);
    const dentist = rows.filter((r) => r.payee === "Dentist");
    expect(dentist).toHaveLength(1);
    expect(dentist[0].date).toBe("2026-07-15");
  });

  it("S3: Netflix does not exceed COUNT=6 in 6-month window", async () => {
    const { rows } = await forecast(accountAId, END_6M);
    const netflix = rows.filter((r) => r.payee === "Netflix");
    expect(netflix.length).toBeLessThanOrEqual(6);
    expect(netflix.length).toBeGreaterThan(0); // 3 in this window
  });

  it("S3: 6-month end balance is correct", async () => {
    // Base 4611.70 + Salary(6×2500) + Dentist(-80) + Gym(17×-45)
    //    + StandingOrder(6×-200) + CouncilTax(6×-150) + Netflix(3×-12.99)
    const { endBalance } = await forecast(accountAId, END_6M);
    expect(endBalance).toBeCloseTo(16627.73, 1);
  });

  // ── Section 4 — 12-month forecast ─────────────────────────────────────────

  it("S4: Birthday Transfer (Account B) appears exactly once in B's 12-month", async () => {
    const { rows } = await forecast(accountBId, END_12M);
    const bday = rows.filter((r) => r.payee === "Birthday Transfer");
    expect(bday).toHaveLength(1);
    expect(bday[0].date).toBe("2026-06-15");
  });

  it("S4: Annual Insurance (Account B) appears exactly once in B's 12-month", async () => {
    const { rows } = await forecast(accountBId, END_12M);
    const insurance = rows.filter((r) => r.payee === "Annual Insurance");
    expect(insurance).toHaveLength(1);
    expect(insurance[0].date).toBe("2027-01-01");
  });

  it("S4: Council Tax has ≤ 10 occurrences in 12-month window (exactly 7)", async () => {
    const { rows } = await forecast(accountAId, END_12M);
    const ct = rows.filter((r) => r.payee === "Council Tax");
    expect(ct.length).toBeLessThanOrEqual(10);
    expect(ct.length).toBe(7); // Apr-Oct 2026
  });

  it("S4: Gym has no occurrences after 2026-07-01 in 12-month window", async () => {
    const { rows } = await forecast(accountAId, END_12M);
    const gym = rows.filter((r) => r.payee === "Gym");
    expect(gym.length).toBeGreaterThan(0);
    expect(gym.every((r) => r.date <= "2026-07-01")).toBe(true);
  });

  it("S4: Account A 12-month end balance is correct", async () => {
    // Base 4611.70 + Salary(12×2500) + Dentist(-80) + Gym(17×-45)
    //    + StandingOrder(12×-200) + CouncilTax(7×-150) + Netflix(4×-12.99)
    const { endBalance } = await forecast(accountAId, END_12M);
    expect(endBalance).toBeCloseTo(30264.74, 1);
  });

  // ── Section 5 — Delete uncleared transactions ──────────────────────────────

  it("S5: delete Account A's two uncleared transactions", async () => {
    // txnAIds[5] = Pending Purchase -78.00, txnAIds[6] = Coffee -12.50
    await invoke("transactions:delete", txnAIds[5]);
    await invoke("transactions:delete", txnAIds[6]);
  });

  it("S5: Account A computedBalance = 4702.20 after deleting uncleared", async () => {
    const a = await invoke<{ computedBalance: number }>(
      "accounts:getById",
      accountAId,
    );
    expect(a.computedBalance).toBeCloseTo(EXPECTED.ACCOUNT_A_CLEARED, 2);
  });

  it("S5: 3-month end balance shifts by +90.50", async () => {
    const { endBalance } = await forecast(accountAId, END_3M);
    expect(endBalance).toBeCloseTo(10463.71 - UNCLEARED_SUM, 1); // +90.50
  });

  it("S5: 6-month end balance shifts by +90.50", async () => {
    const { endBalance } = await forecast(accountAId, END_6M);
    expect(endBalance).toBeCloseTo(16627.73 - UNCLEARED_SUM, 1);
  });

  it("S5: 12-month end balance shifts by +90.50", async () => {
    const { endBalance } = await forecast(accountAId, END_12M);
    expect(endBalance).toBeCloseTo(30264.74 - UNCLEARED_SUM, 1);
  });

  // ── Section 6 — Modify/delete scheduled transactions ──────────────────────

  it("S6: change Gym -45 → -50; 3-month balance decreases by 13×5 = 65", async () => {
    const { endBalance: before } = await forecast(accountAId, END_3M);
    const gymId = schedAIds[2]; // SCHEDULED_A[2] = Gym
    await invoke("scheduled_transactions:update", gymId, { amount: -50 });
    const { endBalance: after } = await forecast(accountAId, END_3M);
    // 13 Gym occurrences × £5 change = -65
    expect(after - before).toBeCloseTo(-65, 1);
  });

  it("S6: delete Gym; 3-month balance increases by 13×50 = 650", async () => {
    const { endBalance: before } = await forecast(accountAId, END_3M);
    const gymId = schedAIds[2];
    await invoke("scheduled_transactions:delete", gymId);
    const { endBalance: after } = await forecast(accountAId, END_3M);
    // 13 occurrences × £50 removed = +650
    expect(after - before).toBeCloseTo(650, 1);
  });

  it("S6: after Gym deletion, 12-month forecast has no Gym occurrences", async () => {
    const { rows } = await forecast(accountAId, END_12M);
    expect(rows.some((r) => r.payee === "Gym")).toBe(false);
  });

  it("S6: delete Council Tax; 12-month balance increases by 7×150 = 1050", async () => {
    const { endBalance: before } = await forecast(accountAId, END_12M);
    const councilTaxId = schedAIds[4]; // SCHEDULED_A[4] = Council Tax
    await invoke("scheduled_transactions:delete", councilTaxId);
    const { endBalance: after } = await forecast(accountAId, END_12M);
    expect(after - before).toBeCloseTo(1050, 1);
  });
});
