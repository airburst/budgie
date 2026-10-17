import type { ScheduledTransaction } from "@/types/electron";
import { RRule } from "rrule";

export type DueSoonSummary = {
  /** Sum of positive amounts due in the window. */
  income: number;
  /** Absolute sum of negative amounts due in the window. Never netted. */
  outgoing: number;
  count: number;
};

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Active schedules whose next due date falls in the inclusive window
 * [today, today + 7 days]. This is the next-due-date only, not a recurrence
 * expansion.
 */
export function summarizeDueSoon(
  scheduled: ScheduledTransaction[],
): DueSoonSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(today.getDate() + 7);

  let income = 0;
  let outgoing = 0;
  let count = 0;
  for (const s of scheduled) {
    if (!s.active || !s.nextDueDate) continue;
    const d = new Date(s.nextDueDate);
    if (d < today || d > in7) continue;
    count += 1;
    if (s.amount > 0) income += s.amount;
    else if (s.amount < 0) outgoing += Math.abs(s.amount);
  }
  return { income: cents(income), outgoing: cents(outgoing), count };
}

/** "All accounts", the account name, or "N accounts". */
export function accountScopeLabel(
  selected: Array<{ id: number; name: string }>,
  totalCount: number,
): string {
  if (selected.length === 0) return "No accounts";
  if (selected.length === totalCount) return "All accounts";
  if (selected.length === 1) return selected[0]!.name;
  return `${selected.length} accounts`;
}

const FREQ_LABELS: Record<number, string> = {
  [RRule.DAILY]: "Daily",
  [RRule.WEEKLY]: "Weekly",
  [RRule.MONTHLY]: "Monthly",
  [RRule.YEARLY]: "Yearly",
};

/** Plain-text recurrence label ("Once" is DAILY + COUNT=1, see buildRRule). */
export function frequencyLabel(rruleStr: string): string {
  try {
    const rule = RRule.fromString(rruleStr);
    if (rule.options.freq === RRule.DAILY && rule.options.count === 1) {
      return "Once";
    }
    return FREQ_LABELS[rule.options.freq] ?? rruleStr;
  } catch {
    return rruleStr;
  }
}

/** Paused / auto-post status as text, never colour alone. */
export function scheduleStatusText(s: ScheduledTransaction): string[] {
  const status: string[] = [];
  if (!s.active) status.push("Paused");
  if (s.autoPost) {
    status.push(
      s.daysInAdvance
        ? `Auto-post ${s.daysInAdvance} ${s.daysInAdvance === 1 ? "day" : "days"} ahead`
        : "Auto-post",
    );
  }
  return status;
}

export type SortField = "nextDueDate" | "payee" | "amount" | "accountName";

export const SORT_FIELD_LABELS: Record<SortField, string> = {
  nextDueDate: "Next due",
  payee: "Payee",
  amount: "Amount",
  accountName: "Account",
};

export const SORT_OPTIONS: Array<{
  value: string;
  field: SortField;
  desc: boolean;
  label: string;
}> = [
  {
    value: "nextDueDate:asc",
    field: "nextDueDate",
    desc: false,
    label: "Next due, soonest first",
  },
  {
    value: "nextDueDate:desc",
    field: "nextDueDate",
    desc: true,
    label: "Next due, latest first",
  },
  { value: "payee:asc", field: "payee", desc: false, label: "Payee, A to Z" },
  { value: "payee:desc", field: "payee", desc: true, label: "Payee, Z to A" },
  {
    value: "amount:asc",
    field: "amount",
    desc: false,
    label: "Amount, lowest first",
  },
  {
    value: "amount:desc",
    field: "amount",
    desc: true,
    label: "Amount, highest first",
  },
  {
    value: "accountName:asc",
    field: "accountName",
    desc: false,
    label: "Account, A to Z",
  },
  {
    value: "accountName:desc",
    field: "accountName",
    desc: true,
    label: "Account, Z to A",
  },
];
