import type { BalanceTransaction } from "@/lib/balances";
import { computeRunningBalances } from "@/lib/balances";
import { describe, expect, it } from "vitest";

function tx(id: number, date: string, amount: number): BalanceTransaction {
  return { id, date, amount };
}

describe("computeRunningBalances", () => {
  it("returns empty map for empty transaction list", () => {
    const map = computeRunningBalances([], 1000);
    expect(map.size).toBe(0);
  });

  it("single transaction: opening balance + amount", () => {
    const map = computeRunningBalances([tx(1, "2026-01-15", 500)], 1000);
    expect(map.get(1)).toBe(1500);
  });

  it("accumulates running balance across multiple transactions", () => {
    const map = computeRunningBalances(
      [
        tx(1, "2026-01-01", 100),
        tx(2, "2026-02-01", -50),
        tx(3, "2026-03-01", 200),
      ],
      0,
    );
    expect(map.get(1)).toBe(100);
    expect(map.get(2)).toBe(50);
    expect(map.get(3)).toBe(250);
  });

  it("sorts chronologically regardless of insertion order", () => {
    const map = computeRunningBalances(
      [
        tx(3, "2026-03-01", 200),
        tx(1, "2026-01-01", 100),
        tx(2, "2026-02-01", -50),
      ],
      0,
    );
    expect(map.get(1)).toBe(100);
    expect(map.get(2)).toBe(50);
    expect(map.get(3)).toBe(250);
  });

  it("sorts same-date transactions by id ascending", () => {
    // id=5 should be processed before id=10
    const map = computeRunningBalances(
      [tx(10, "2026-01-01", 100), tx(5, "2026-01-01", 50)],
      0,
    );
    expect(map.get(5)).toBe(50); // processed first
    expect(map.get(10)).toBe(150); // processed second
  });

  it("uses opening balance as the starting point", () => {
    const map = computeRunningBalances([tx(1, "2026-01-01", -100)], 500);
    expect(map.get(1)).toBe(400);
  });

  it("allows negative running balance", () => {
    const map = computeRunningBalances([tx(1, "2026-01-01", -600)], 500);
    expect(map.get(1)).toBe(-100);
  });
});
