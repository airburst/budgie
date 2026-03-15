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
  transferToAccountId: number | null;
  active: number | boolean;
  rrule: string;
  nextDueDate: string | null;
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
    if (!s.active) continue;
    const isSource = s.accountId === accountId;
    const isDestination =
      s.transferToAccountId != null && s.transferToAccountId === accountId;
    if (!isSource && !isDestination) continue;
    // For the receiving side of a transfer, flip to a positive (incoming) amount
    const rowAmount = isDestination && !isSource ? -s.amount : s.amount;
    try {
      // Only override DTSTART when the rrule has none embedded.
      // Rules with an explicit DTSTART (e.g. COUNT-bounded schedules) must keep
      // their original anchor; the nextDueDate guard below handles the lower bound.
      let rule: RRule;
      if (s.rrule.includes("DTSTART:")) {
        rule = RRule.fromString(s.rrule);
      } else {
        // Anchor to nextDueDate so the day-of-month and interval cadence are
        // correct (e.g. every-3-months from Apr 20, not from today).
        const dtstart = s.nextDueDate
          ? new Date(s.nextDueDate + "T00:00:00Z")
          : fromDate;
        rule = new RRule({ ...RRule.parseString(s.rrule), dtstart });
      }
      const occurrences = rule.between(fromDate, toDate, true);
      for (const d of occurrences) {
        const dateStr = [
          d.getUTCFullYear(),
          String(d.getUTCMonth() + 1).padStart(2, "0"),
          String(d.getUTCDate()).padStart(2, "0"),
        ].join("-");
        if (dateStr <= today) continue;
        // Respect the schedule's start date — skip occurrences before nextDueDate
        if (s.nextDueDate && dateStr < s.nextDueDate) continue;
        scheduledRows.push({
          key: `sched-${s.id}-${dateStr}${isDestination && !isSource ? "-in" : ""}`,
          date: dateStr,
          payee: s.payee,
          amount: rowAmount,
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
