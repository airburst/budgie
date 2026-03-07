export type BalanceTransaction = {
  id: number;
  date: string;
  amount: number;
};

/**
 * Computes the running balance for each transaction id in chronological order.
 * Transactions with the same date are sub-sorted by id (ascending).
 */
export function computeRunningBalances(
  transactions: BalanceTransaction[],
  openingBalance: number,
): Map<number, number> {
  const sorted = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
  );
  const map = new Map<number, number>();
  let balance = openingBalance;
  for (const tx of sorted) {
    balance += tx.amount;
    map.set(tx.id, balance);
  }
  return map;
}
