import type { ForecastScheduled, ForecastTransaction } from "@/lib/forecast";
import { buildForecastRows } from "@/lib/forecast";
import { describe, expect, it } from "vitest";

const TODAY = "2026-03-07";
const END_3M = "2026-06-07";

function tx(
  overrides: Partial<ForecastTransaction> & {
    id: number;
    date: string;
    amount: number;
  },
): ForecastTransaction {
  return { payee: "Test", categoryId: null, notes: null, ...overrides };
}

function sched(
  overrides: Partial<ForecastScheduled> & {
    id: number;
    accountId: number;
    rrule: string;
    amount: number;
  },
): ForecastScheduled {
  return {
    payee: "Test Sched",
    active: true,
    categoryId: null,
    notes: null,
    ...overrides,
  };
}

describe("buildForecastRows", () => {
  it("returns empty array for empty inputs", () => {
    expect(buildForecastRows([], [], 1, TODAY, END_3M)).toEqual([]);
  });

  it("includes real transactions strictly after today", () => {
    const rows = buildForecastRows(
      [tx({ id: 1, date: "2026-03-10", amount: 100 })],
      [],
      1,
      TODAY,
      END_3M,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-03-10");
    expect(rows[0].amount).toBe(100);
    expect(rows[0].isScheduled).toBe(false);
  });

  it("excludes real transactions on or before today", () => {
    const rows = buildForecastRows(
      [
        tx({ id: 1, date: "2026-03-06", amount: 50 }),
        tx({ id: 2, date: "2026-03-07", amount: 75 }), // today — not strictly future
      ],
      [],
      1,
      TODAY,
      END_3M,
    );
    expect(rows).toHaveLength(0);
  });

  it("expands monthly scheduled rule across 3-month window", () => {
    const rows = buildForecastRows(
      [],
      [
        sched({
          id: 1,
          accountId: 1,
          rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
          amount: 2500,
        }),
      ],
      1,
      TODAY,
      END_3M,
    );
    const dates = rows.map((r) => r.date);
    expect(dates).toContain("2026-04-01");
    expect(dates).toContain("2026-05-01");
    expect(dates).toContain("2026-06-01");
    expect(dates).not.toContain("2026-03-01"); // before today's window
    expect(rows.every((r) => r.amount === 2500)).toBe(true);
    expect(rows.every((r) => r.isScheduled)).toBe(true);
  });

  it("excludes inactive scheduled transactions", () => {
    const rows = buildForecastRows(
      [],
      [
        sched({
          id: 1,
          accountId: 1,
          rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
          amount: -50,
          active: false,
        }),
      ],
      1,
      TODAY,
      END_3M,
    );
    expect(rows).toHaveLength(0);
  });

  it("excludes scheduled transactions belonging to a different account", () => {
    const rows = buildForecastRows(
      [],
      [
        sched({
          id: 1,
          accountId: 2, // different account
          rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
          amount: -50,
        }),
      ],
      1, // forecasting for account 1
      TODAY,
      END_3M,
    );
    expect(rows).toHaveLength(0);
  });

  it("respects UNTIL — no occurrences after the UNTIL date", () => {
    const rows = buildForecastRows(
      [],
      [
        sched({
          id: 1,
          accountId: 1,
          rrule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260401T000000Z",
          amount: -45,
        }),
      ],
      1,
      TODAY,
      END_3M,
    );
    const dates = rows.map((r) => r.date);
    // First Monday after today is Mar 9
    expect(dates).toContain("2026-03-09");
    // No Monday after Apr 1 should appear
    expect(dates.every((d) => d <= "2026-04-01")).toBe(true);
    expect(dates).not.toContain("2026-04-07");
  });

  it("result is sorted by date ascending", () => {
    const rows = buildForecastRows(
      [
        tx({ id: 1, date: "2026-05-10", amount: 100 }),
        tx({ id: 2, date: "2026-04-05", amount: 200 }),
      ],
      [
        sched({
          id: 1,
          accountId: 1,
          rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
          amount: 2500,
        }),
      ],
      1,
      TODAY,
      END_3M,
    );
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].date >= rows[i - 1].date).toBe(true);
    }
  });

  it("skips invalid rrule strings without throwing", () => {
    expect(() =>
      buildForecastRows(
        [],
        [sched({ id: 1, accountId: 1, rrule: "NOT_VALID_RRULE", amount: -10 })],
        1,
        TODAY,
        END_3M,
      ),
    ).not.toThrow();
  });
});
