import type {
  BudgetAllocation,
  BudgetTransfer,
  Envelope,
  EnvelopeCategory,
  Transaction,
} from "@/types/electron";

export function toMonth(date: string): string {
  return date.slice(0, 7);
}

export function prevMonth(month: string): string {
  const parts = month.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonth(month: string): string {
  const parts = month.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function computeRollover(
  envelopeId: number,
  targetMonth: string,
  startMonth: string,
  allAllocations: BudgetAllocation[],
  allTransfers: BudgetTransfer[],
  transactions: Transaction[],
  categoryIds: number[],
): number {
  let rolledOver = 0;
  let current = startMonth;

  while (current < targetMonth) {
    const alloc = allAllocations.find(
      (a) => a.envelopeId === envelopeId && a.month === current,
    );
    const assigned = alloc?.assigned ?? 0;

    const activity = transactions
      .filter(
        (t) =>
          t.categoryId &&
          categoryIds.includes(t.categoryId) &&
          toMonth(t.date) === current,
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const tIn = allTransfers
      .filter((t) => t.toEnvelopeId === envelopeId && t.month === current)
      .reduce((sum, t) => sum + t.amount, 0);
    const tOut = allTransfers
      .filter((t) => t.fromEnvelopeId === envelopeId && t.month === current)
      .reduce((sum, t) => sum + t.amount, 0);

    const available = rolledOver + assigned + activity + tIn - tOut;
    rolledOver = Math.max(0, available);

    current = nextMonth(current);
  }

  return rolledOver;
}

export function computeOverspendForMonth(
  envelopes: Envelope[],
  month: string,
  allAllocations: BudgetAllocation[],
  allTransfers: BudgetTransfer[],
  transactions: Transaction[],
  mappings: EnvelopeCategory[],
): number {
  let totalOverspend = 0;

  for (const env of envelopes) {
    const categoryIds = mappings
      .filter((m) => m.envelopeId === env.id)
      .map((m) => m.categoryId);

    const startMonth = toMonth(env.createdAt ?? month);
    const rolledOver = computeRollover(
      env.id,
      month,
      startMonth,
      allAllocations,
      allTransfers,
      transactions,
      categoryIds,
    );

    const alloc = allAllocations.find(
      (a) => a.envelopeId === env.id && a.month === month,
    );
    const assigned = alloc?.assigned ?? 0;

    const activity = transactions
      .filter(
        (t) =>
          t.categoryId &&
          categoryIds.includes(t.categoryId) &&
          toMonth(t.date) === month,
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const tIn = allTransfers
      .filter((t) => t.toEnvelopeId === env.id && t.month === month)
      .reduce((sum, t) => sum + t.amount, 0);
    const tOut = allTransfers
      .filter((t) => t.fromEnvelopeId === env.id && t.month === month)
      .reduce((sum, t) => sum + t.amount, 0);

    const available = rolledOver + assigned + activity + tIn - tOut;
    if (available < 0) {
      totalOverspend += Math.abs(available);
    }
  }

  return totalOverspend;
}
