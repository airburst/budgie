import { RRule } from "rrule";

export type ForecastRow = {
  key: string;
  date: string;
  payee: string;
  amount: number;
  categoryId: number | null;
  notes: string | null;
  isScheduled: boolean;
};

export type ForecastTransaction = {
  id: number;
  date: string;
  payee: string;
  amount: number;
  categoryId: number | null;
  notes: string | null;
};

export type ForecastScheduled = {
  id: number;
  accountId: number;
  active: number | boolean;
  rrule: string;
  payee: string;
  amount: number;
  categoryId: number | null;
  notes: string | null;
};

export function buildForecastRows(
  transactions: ForecastTransaction[],
  scheduled: ForecastScheduled[],
  accountId: number,
  today: string,
  endDate: string,
): ForecastRow[] {
  const futureTxns: ForecastRow[] = transactions
    .filter((t) => t.date > today)
    .map((t) => ({
      key: `real-${t.id}`,
      date: t.date,
      payee: t.payee,
      amount: t.amount,
      categoryId: t.categoryId,
      notes: t.notes,
      isScheduled: false,
    }));

  const scheduledRows: ForecastRow[] = [];

  const fromDate = new Date(today + "T00:00:00Z");
  const toDate = new Date(endDate + "T23:59:59Z");

  for (const s of scheduled) {
    if (!s.active || s.accountId !== accountId) continue;
    try {
      const rule = RRule.fromString(s.rrule);
      const occurrences = rule.between(fromDate, toDate, true);
      for (const d of occurrences) {
        const dateStr = [
          d.getUTCFullYear(),
          String(d.getUTCMonth() + 1).padStart(2, "0"),
          String(d.getUTCDate()).padStart(2, "0"),
        ].join("-");
        if (dateStr <= today) continue;
        scheduledRows.push({
          key: `sched-${s.id}-${dateStr}`,
          date: dateStr,
          payee: s.payee,
          amount: s.amount,
          categoryId: s.categoryId,
          notes: s.notes,
          isScheduled: true,
        });
      }
    } catch {
      // skip invalid rrule strings
    }
  }

  return [...futureTxns, ...scheduledRows].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
