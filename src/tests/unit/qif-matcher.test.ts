import { describe, expect, it } from "vitest";
import { matchQifTransactions } from "@/lib/qif-matcher";
import type { QifTransaction } from "@/lib/qif-parser";
import type { Transaction } from "@/types/electron";

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    accountId: 1,
    date: "2026-03-09",
    payee: "SOME PAYEE",
    amount: -50,
    categoryId: null,
    notes: null,
    cleared: false,
    reconciled: false,
    transferTransactionId: null,
    createdAt: "2026-03-09",
    ...overrides,
  };
}

function makeQif(overrides: Partial<QifTransaction> = {}): QifTransaction {
  return {
    date: "2026-03-09",
    payee: "SOME PAYEE",
    amount: -50,
    memo: null,
    ...overrides,
  };
}

describe("matchQifTransactions", () => {
  it("marks new transactions as checked", () => {
    const results = matchQifTransactions([makeQif()], [], null);
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("new");
    expect(results[0]!.checked).toBe(true);
  });

  it("detects exact duplicate by amount and date", () => {
    const existing = [makeTx({ id: 10, amount: -50, date: "2026-03-09" })];
    const results = matchQifTransactions(
      [makeQif({ amount: -50, date: "2026-03-09" })],
      existing,
      null,
    );
    expect(results[0]!.status).toBe("duplicate");
    expect(results[0]!.matchedTxId).toBe(10);
    expect(results[0]!.checked).toBe(false);
  });

  it("detects duplicate within ±3 day window", () => {
    const existing = [makeTx({ id: 10, amount: -50, date: "2026-03-07" })];
    const results = matchQifTransactions(
      [makeQif({ amount: -50, date: "2026-03-09" })],
      existing,
      null,
    );
    expect(results[0]!.status).toBe("duplicate");
  });

  it("does not match if date difference > 3 days", () => {
    const existing = [makeTx({ id: 10, amount: -50, date: "2026-03-01" })];
    const results = matchQifTransactions(
      [makeQif({ amount: -50, date: "2026-03-09" })],
      existing,
      null,
    );
    expect(results[0]!.status).toBe("new");
  });

  it("does not match if amount differs", () => {
    const existing = [makeTx({ id: 10, amount: -51, date: "2026-03-09" })];
    const results = matchQifTransactions(
      [makeQif({ amount: -50, date: "2026-03-09" })],
      existing,
      null,
    );
    expect(results[0]!.status).toBe("new");
  });

  it("marks out-of-range when date <= lastReconcileDate", () => {
    const results = matchQifTransactions(
      [makeQif({ date: "2026-03-01" })],
      [],
      "2026-03-05",
    );
    expect(results[0]!.status).toBe("out-of-range");
    expect(results[0]!.checked).toBe(false);
  });

  it("marks new when date > lastReconcileDate", () => {
    const results = matchQifTransactions(
      [makeQif({ date: "2026-03-09" })],
      [],
      "2026-03-05",
    );
    expect(results[0]!.status).toBe("new");
    expect(results[0]!.checked).toBe(true);
  });

  it("does not double-match same existing transaction", () => {
    const existing = [makeTx({ id: 10, amount: -50, date: "2026-03-09" })];
    const qifTxs = [
      makeQif({ amount: -50, date: "2026-03-09", payee: "A" }),
      makeQif({ amount: -50, date: "2026-03-09", payee: "B" }),
    ];
    const results = matchQifTransactions(qifTxs, existing, null);
    const dups = results.filter((r) => r.status === "duplicate");
    expect(dups).toHaveLength(1);
    const news = results.filter((r) => r.status === "new");
    expect(news).toHaveLength(1);
  });

  it("handles empty QIF list", () => {
    const results = matchQifTransactions([], [makeTx()], null);
    expect(results).toHaveLength(0);
  });

  it("handles null lastReconcileDate", () => {
    const results = matchQifTransactions(
      [makeQif({ date: "2020-01-01" })],
      [],
      null,
    );
    expect(results[0]!.status).toBe("new");
  });
});
