// SY-031: the format normalisation Start applies to legacy rows.
import {
  normaliseDate,
  normaliseMonth,
  normaliseRow,
  normaliseTimestamp,
} from "@/services/sync/normalise";
import { describe, expect, it } from "vitest";

describe("normaliseTimestamp", () => {
  it.each([
    ["2026-11-20 09:12:44", "2026-11-20 09:12:44"],
    ["2026-11-20T09:12:44Z", "2026-11-20 09:12:44"],
    ["2026-11-20T09:12:44.123Z", "2026-11-20 09:12:44"],
    ["2026-11-20 09:12:44.5", "2026-11-20 09:12:44"],
    ["2026-11-20T09:12:44", "2026-11-20 09:12:44"],
    ["2026-11-20T10:12:44+01:00", "2026-11-20 09:12:44"],
    ["2026-11-20T04:12:44-0500", "2026-11-20 09:12:44"],
    ["2026-11-20T00:30:00+01:00", "2026-11-19 23:30:00"],
    ["2026-11-20T09:12", "2026-11-20 09:12:00"],
    ["2026-11-20", "2026-11-20 00:00:00"],
    ["  2026-11-20 09:12:44 ", "2026-11-20 09:12:44"],
    [1795342530, "2026-11-22 10:15:30"],
    [1795342530000, "2026-11-22 10:15:30"],
  ])("%s -> %s", (input, expected) => {
    expect(normaliseTimestamp(input)).toBe(expected);
  });

  it.each([null, "", "yesterday", "2026-02-30 10:00:00", "2026-11-20 25:00:00", -5])(
    "%s cannot be read",
    (input) => {
      expect(normaliseTimestamp(input)).toBeNull();
    },
  );
});

describe("normaliseDate and normaliseMonth", () => {
  it.each([
    ["2026-11-20", "2026-11-20"],
    ["2026-11-20T00:00:00.000Z", "2026-11-20"],
    ["2026-11-20T23:30:00+01:00", "2026-11-20"],
    ["2026-1-5", "2026-01-05"],
    ["2026/01/05", "2026-01-05"],
    [1795342530000, "2026-11-22"],
  ])("date %s -> %s", (input, expected) => {
    expect(normaliseDate(input)).toBe(expected);
  });

  it.each(["20/11/2026", "2026-02-30", "soon", ""])("date %s cannot be read", (input) => {
    expect(normaliseDate(input)).toBeNull();
  });

  it.each([
    ["2026-11", "2026-11"],
    ["2026-1", "2026-01"],
    ["2026-11-01", "2026-11"],
    ["2026-11-01T00:00:00Z", "2026-11"],
  ])("month %s -> %s", (input, expected) => {
    expect(normaliseMonth(input)).toBe(expected);
  });

  it.each(["2026-13", "Nov 2026", "2026"])("month %s cannot be read", (input) => {
    expect(normaliseMonth(input)).toBeNull();
  });
});

describe("normaliseRow", () => {
  const now = "2026-11-22 10:00:00";

  it("leaves a row already in the contract formats alone", () => {
    expect(
      normaliseRow(
        "transactions",
        {
          created_at: "2026-11-20 09:00:00",
          updated_at: "2026-11-20 09:00:00",
          deleted_at: null,
          date: "2026-11-20",
        },
        now,
      ),
    ).toEqual({});
  });

  it("converts timestamps and dates, clears unreadable nullable timestamps", () => {
    expect(
      normaliseRow(
        "scheduled_transactions",
        {
          created_at: "garbage",
          updated_at: "2026-11-20T09:00:00.000Z",
          deleted_at: null,
          next_due_date: "2026-12-01T00:00:00Z",
        },
        now,
      ),
    ).toEqual({
      created_at: null,
      updated_at: "2026-11-20 09:00:00",
      next_due_date: "2026-12-01",
    });
  });

  it("clamps a future edit time to now", () => {
    expect(
      normaliseRow(
        "payees",
        { created_at: null, updated_at: "2027-01-01 00:00:00", deleted_at: null },
        now,
      ),
    ).toEqual({ updated_at: now });
  });

  it("makes the delete fields consistent", () => {
    expect(
      normaliseRow(
        "accounts",
        { created_at: null, updated_at: "2026-11-01 08:00:00", deleted_at: null, deleted: 1 },
        now,
      ),
    ).toEqual({ deleted_at: "2026-11-01 08:00:00" });
    expect(
      normaliseRow(
        "categories",
        { created_at: null, updated_at: null, deleted_at: "nonsense", deleted: 0 },
        now,
      ),
    ).toEqual({ deleted_at: now, deleted: 1 });
    expect(
      normaliseRow(
        "budget_transfers",
        { created_at: null, updated_at: null, deleted_at: "2026-11-01T08:00:00Z", month: "2026-11-01" },
        now,
      ),
    ).toEqual({ deleted_at: "2026-11-01 08:00:00", month: "2026-11" });
  });

  it("leaves an unreadable required date for validation to report", () => {
    expect(
      normaliseRow(
        "transactions",
        { created_at: null, updated_at: null, deleted_at: null, date: "someday" },
        now,
      ),
    ).toEqual({});
  });
});
