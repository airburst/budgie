import { describe, expect, it } from "vitest";
import {
  computeOverspendForMonth,
  computeRollover,
  nextMonth,
  prevMonth,
  toMonth,
} from "@/hooks/budget-computations";

describe("budget computations", () => {
  describe("toMonth", () => {
    it("extracts YYYY-MM from date string", () => {
      expect(toMonth("2026-03-15")).toBe("2026-03");
    });
  });

  describe("prevMonth / nextMonth", () => {
    it("handles mid-year", () => {
      expect(prevMonth("2026-03")).toBe("2026-02");
      expect(nextMonth("2026-03")).toBe("2026-04");
    });
    it("handles year boundary", () => {
      expect(prevMonth("2026-01")).toBe("2025-12");
      expect(nextMonth("2025-12")).toBe("2026-01");
    });
  });

  describe("computeRollover", () => {
    it("returns 0 when target is the start month", () => {
      const result = computeRollover(1, "2026-03", "2026-03", [], [], [], []);
      expect(result).toBe(0);
    });

    it("rolls positive balance forward", () => {
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 300,
          createdAt: null,
        },
      ];
      const transactions = [
        {
          id: 1,
          accountId: 1,
          categoryId: 10,
          date: "2026-02-15",
          payee: "Shop",
          amount: -200,
          notes: null,
          cleared: true,
          reconciled: false,
          transferTransactionId: null,
          createdAt: null,
        },
      ];
      const result = computeRollover(
        1,
        "2026-03",
        "2026-02",
        allocations,
        [],
        transactions,
        [10],
      );
      expect(result).toBe(100);
    });

    it("clamps negative balance to 0 (overspend resets)", () => {
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 100,
          createdAt: null,
        },
      ];
      const transactions = [
        {
          id: 1,
          accountId: 1,
          categoryId: 10,
          date: "2026-02-15",
          payee: "Shop",
          amount: -200,
          notes: null,
          cleared: true,
          reconciled: false,
          transferTransactionId: null,
          createdAt: null,
        },
      ];
      const result = computeRollover(
        1,
        "2026-03",
        "2026-02",
        allocations,
        [],
        transactions,
        [10],
      );
      expect(result).toBe(0);
    });

    it("includes transfers in rollover calculation", () => {
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 100,
          createdAt: null,
        },
      ];
      const transfers = [
        {
          id: 1,
          fromEnvelopeId: 2,
          toEnvelopeId: 1,
          month: "2026-02",
          amount: 50,
          notes: null,
          createdAt: null,
        },
      ];
      const result = computeRollover(
        1,
        "2026-03",
        "2026-02",
        allocations,
        transfers,
        [],
        [],
      );
      expect(result).toBe(150);
    });
  });

  describe("computeOverspendForMonth", () => {
    it("returns 0 when no envelopes are overspent", () => {
      const envelopes = [
        {
          id: 1,
          name: "Food",
          active: true,
          sortOrder: 0,
          createdAt: "2026-01-01",
        },
      ];
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 300,
          createdAt: null,
        },
      ];
      const mappings = [{ id: 1, envelopeId: 1, categoryId: 10 }];
      const transactions = [
        {
          id: 1,
          accountId: 1,
          categoryId: 10,
          date: "2026-02-15",
          payee: "Shop",
          amount: -200,
          notes: null,
          cleared: true,
          reconciled: false,
          transferTransactionId: null,
          createdAt: null,
        },
      ];
      const result = computeOverspendForMonth(
        envelopes,
        "2026-02",
        allocations,
        [],
        transactions,
        mappings,
      );
      expect(result).toBe(0);
    });

    it("returns absolute value of overspend", () => {
      const envelopes = [
        {
          id: 1,
          name: "Food",
          active: true,
          sortOrder: 0,
          createdAt: "2026-01-01",
        },
      ];
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 100,
          createdAt: null,
        },
      ];
      const mappings = [{ id: 1, envelopeId: 1, categoryId: 10 }];
      const transactions = [
        {
          id: 1,
          accountId: 1,
          categoryId: 10,
          date: "2026-02-15",
          payee: "Shop",
          amount: -250,
          notes: null,
          cleared: true,
          reconciled: false,
          transferTransactionId: null,
          createdAt: null,
        },
      ];
      const result = computeOverspendForMonth(
        envelopes,
        "2026-02",
        allocations,
        [],
        transactions,
        mappings,
      );
      expect(result).toBe(150);
    });
  });
});
