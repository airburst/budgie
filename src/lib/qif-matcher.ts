import type { Transaction } from "@/types/electron";
import type { QifTransaction } from "./qif-parser";

export type MatchResult = {
  qifTx: QifTransaction;
  status: "new" | "duplicate" | "out-of-range";
  matchedTxId?: number;
  checked: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MATCH_WINDOW_DAYS = 3;

export function matchQifTransactions(
  qifTxs: QifTransaction[],
  existingTxs: Transaction[],
  lastReconcileDate: string | null,
): MatchResult[] {
  // Track which existing txs have already been matched to avoid double-matching
  const usedIds = new Set<number>();

  return qifTxs.map((qifTx) => {
    // Out of range: date ≤ last reconciled
    if (lastReconcileDate && qifTx.date <= lastReconcileDate) {
      return { qifTx, status: "out-of-range", checked: false };
    }

    // Find duplicate: same amount + date within ±3 days
    const qifTime = new Date(qifTx.date).getTime();
    const match = existingTxs.find((tx) => {
      if (usedIds.has(tx.id)) return false;
      if (Math.abs(tx.amount - qifTx.amount) > 0.005) return false;
      const txTime = new Date(tx.date).getTime();
      return Math.abs(txTime - qifTime) <= MATCH_WINDOW_DAYS * DAY_MS;
    });

    if (match) {
      usedIds.add(match.id);
      return {
        qifTx,
        status: "duplicate",
        matchedTxId: match.id,
        checked: false,
      };
    }

    return { qifTx, status: "new", checked: true };
  });
}
