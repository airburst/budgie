import type { ScheduledTransaction } from "@/types/electron";
import { computeNextOccurrenceAfter } from "./recurrence/buildRRule";

/** The due date after this one; null when there is none (exhausted or unset). */
export function nextDueDateAfter(sched: ScheduledTransaction): string | null {
  return sched.nextDueDate
    ? computeNextOccurrenceAfter(sched.rrule, sched.nextDueDate)
    : null;
}

/**
 * Moves a schedule to its next date without recording anything. An exhausted
 * schedule (e.g. "once") will never occur again, so it is deleted instead.
 */
export async function advanceScheduledTransaction(sched: ScheduledTransaction) {
  const next = nextDueDateAfter(sched);
  if (next === null) {
    await window.api.deleteScheduledTransaction(sched.id);
  } else {
    await window.api.updateScheduledTransaction(sched.id, {
      nextDueDate: next,
    });
  }
}
