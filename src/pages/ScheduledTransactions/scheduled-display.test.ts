import type { ScheduledTransaction } from "@/types/electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountScopeLabel,
  frequencyLabel,
  scheduleStatusText,
  summarizeDueSoon,
} from "./scheduled-display";

function makeTx(
  overrides: Partial<ScheduledTransaction> = {},
): ScheduledTransaction {
  return {
    id: 1,
    accountId: 1,
    categoryId: null,
    payee: "Test",
    amount: -100,
    rrule: "FREQ=MONTHLY",
    nextDueDate: "2026-03-08",
    autoPost: false,
    notes: null,
    active: true,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

describe("summarizeDueSoon", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-07T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("splits mixed income and outgoing without netting", () => {
    expect(
      summarizeDueSoon([
        makeTx({ id: 1, amount: 2000, nextDueDate: "2026-03-09" }),
        makeTx({ id: 2, amount: -800, nextDueDate: "2026-03-10" }),
        makeTx({ id: 3, amount: -25.5, nextDueDate: "2026-03-10" }),
      ]),
    ).toEqual({ income: 2000, outgoing: 825.5, count: 3 });
  });

  it("returns explicit zeros for an empty or one-sided set", () => {
    expect(summarizeDueSoon([])).toEqual({ income: 0, outgoing: 0, count: 0 });
    expect(
      summarizeDueSoon([makeTx({ amount: 40, nextDueDate: "2026-03-09" })]),
    ).toEqual({ income: 40, outgoing: 0, count: 1 });
  });

  it("keeps the inclusive 7-day window", () => {
    const result = summarizeDueSoon([
      makeTx({ id: 1, nextDueDate: "2026-03-14" }),
      makeTx({ id: 2, nextDueDate: "2026-03-15" }),
      makeTx({ id: 3, nextDueDate: "2026-03-01" }),
    ]);
    expect(result.count).toBe(1);
  });

  it("ignores paused schedules and schedules without a next due date", () => {
    expect(
      summarizeDueSoon([
        makeTx({ id: 1, active: false }),
        makeTx({ id: 2, nextDueDate: null }),
      ]),
    ).toEqual({ income: 0, outgoing: 0, count: 0 });
  });

  it("scopes to the schedules it is given (filtered fixtures)", () => {
    const all = [
      makeTx({ id: 1, accountId: 1, amount: -10 }),
      makeTx({ id: 2, accountId: 2, amount: -30 }),
    ];
    expect(
      summarizeDueSoon(all.filter((s) => s.accountId === 2)).outgoing,
    ).toBe(30);
  });
});

describe("accountScopeLabel", () => {
  const a = { id: 1, name: "Current" };
  const b = { id: 2, name: "Savings" };
  const c = { id: 3, name: "Credit" };

  it("labels all, some, one and none", () => {
    expect(accountScopeLabel([a, b, c], 3)).toBe("All accounts");
    expect(accountScopeLabel([a, b], 3)).toBe("2 accounts");
    expect(accountScopeLabel([b], 3)).toBe("Savings");
    expect(accountScopeLabel([], 3)).toBe("No accounts");
  });
});

describe("frequencyLabel and scheduleStatusText", () => {
  it("labels recurrence as text", () => {
    expect(frequencyLabel("FREQ=MONTHLY")).toBe("Monthly");
    expect(frequencyLabel("FREQ=DAILY;COUNT=1")).toBe("Once");
  });

  it("describes paused and auto-post status", () => {
    expect(scheduleStatusText(makeTx())).toEqual([]);
    expect(scheduleStatusText(makeTx({ active: false }))).toEqual(["Paused"]);
    expect(
      scheduleStatusText(
        makeTx({ active: false, autoPost: true, daysInAdvance: 3 }),
      ),
    ).toEqual(["Paused", "Auto-post 3 days ahead"]);
  });
});
