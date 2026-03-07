import type { ForecastScheduled, ForecastTransaction } from "@/lib/forecast";
import { buildForecastRows } from "@/lib/forecast";
import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import {
  ACCOUNT_A,
  ACCOUNT_B,
  SCHEDULED_A,
  SCHEDULED_B,
} from "./helpers/fixtures";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

const TODAY = "2026-03-07";
const END_12M = "2027-03-07";
const END_3M = "2026-06-07";

describe("scheduled_transactions IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  let accountAId: number;
  let accountBId: number;
  const schedAIds: number[] = [];

  it("create accounts and all 9 fixture scheduled transactions", async () => {
    const [a] = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_A);
    accountAId = a.id;
    const [b] = await invoke<{ id: number }[]>("accounts:create", ACCOUNT_B);
    accountBId = b.id;

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

  it("getAll returns all 9 scheduled transactions", async () => {
    const all = await invoke<unknown[]>("scheduled_transactions:getAll");
    expect(all).toHaveLength(SCHEDULED_A.length + SCHEDULED_B.length);
  });

  // ── nextDueDate spot-checks ────────────────────────────────────────────────

  it("Monthly Salary nextDueDate = 2026-04-01", async () => {
    const all = await invoke<{ payee: string; nextDueDate: string | null }[]>(
      "scheduled_transactions:getAll",
    );
    const sched = all.find((s) => s.payee === "Monthly Salary");
    expect(sched?.nextDueDate).toBe("2026-04-01");
  });

  it("Dentist nextDueDate = 2026-07-15", async () => {
    const all = await invoke<{ payee: string; nextDueDate: string | null }[]>(
      "scheduled_transactions:getAll",
    );
    const sched = all.find((s) => s.payee === "Dentist");
    expect(sched?.nextDueDate).toBe("2026-07-15");
  });

  it("Gym nextDueDate = 2026-03-09 (first Monday after today)", async () => {
    const all = await invoke<{ payee: string; nextDueDate: string | null }[]>(
      "scheduled_transactions:getAll",
    );
    const sched = all.find((s) => s.payee === "Gym");
    expect(sched?.nextDueDate).toBe("2026-03-09");
  });

  it("Standing Order nextDueDate = 2026-03-20", async () => {
    const all = await invoke<{ payee: string; nextDueDate: string | null }[]>(
      "scheduled_transactions:getAll",
    );
    const sched = all.find((s) => s.payee === "Standing Order");
    expect(sched?.nextDueDate).toBe("2026-03-20");
  });

  // ── RRule expansion via buildForecastRows ──────────────────────────────────

  it("Council Tax (COUNT=10) produces ≤ 10 occurrences in 12-month window and > 0", async () => {
    const allSched = await invoke<ForecastScheduled[]>(
      "scheduled_transactions:getAll",
    );
    const rows = buildForecastRows(
      [] as ForecastTransaction[],
      allSched,
      accountAId,
      TODAY,
      END_12M,
    );
    const councilTaxRows = rows.filter((r) => r.payee === "Council Tax");
    expect(councilTaxRows.length).toBeGreaterThan(0);
    expect(councilTaxRows.length).toBeLessThanOrEqual(10);
  });

  it("Netflix (COUNT=6, bi-monthly) produces ≤ 6 occurrences in 12-month window", async () => {
    const allSched = await invoke<ForecastScheduled[]>(
      "scheduled_transactions:getAll",
    );
    const rows = buildForecastRows(
      [] as ForecastTransaction[],
      allSched,
      accountAId,
      TODAY,
      END_12M,
    );
    const netflixRows = rows.filter((r) => r.payee === "Netflix");
    expect(netflixRows.length).toBeGreaterThan(0);
    expect(netflixRows.length).toBeLessThanOrEqual(6);
  });

  it("Gym (UNTIL=2026-07-01) has no occurrences after 2026-07-01 in 12-month window", async () => {
    const allSched = await invoke<ForecastScheduled[]>(
      "scheduled_transactions:getAll",
    );
    const rows = buildForecastRows(
      [] as ForecastTransaction[],
      allSched,
      accountAId,
      TODAY,
      END_12M,
    );
    const gymRows = rows.filter((r) => r.payee === "Gym");
    expect(gymRows.length).toBeGreaterThan(0);
    expect(gymRows.every((r) => r.date <= "2026-07-01")).toBe(true);
    expect(gymRows.some((r) => r.date > "2026-07-01")).toBe(false);
  });

  it("Dentist appears in 6-month window but NOT in 3-month window", async () => {
    const allSched = await invoke<ForecastScheduled[]>(
      "scheduled_transactions:getAll",
    );
    const rows3m = buildForecastRows(
      [] as ForecastTransaction[],
      allSched,
      accountAId,
      TODAY,
      END_3M,
    );
    expect(rows3m.some((r) => r.payee === "Dentist")).toBe(false);

    const rows6m = buildForecastRows(
      [] as ForecastTransaction[],
      allSched,
      accountAId,
      TODAY,
      "2026-09-07",
    );
    expect(rows6m.filter((r) => r.payee === "Dentist")).toHaveLength(1);
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────

  it("update Gym amount — getById reflects new amount", async () => {
    const gymId = schedAIds[2]; // index 2 = Gym in SCHEDULED_A
    await invoke("scheduled_transactions:update", gymId, { amount: -50 });
    const sched = await invoke<{ amount: number } | null>(
      "scheduled_transactions:getById",
      gymId,
    );
    expect(sched?.amount).toBe(-50);
  });

  it("delete Gym — getAll returns 8 rows", async () => {
    const gymId = schedAIds[2];
    await invoke("scheduled_transactions:delete", gymId);
    const all = await invoke<unknown[]>("scheduled_transactions:getAll");
    expect(all).toHaveLength(8);
  });
});
