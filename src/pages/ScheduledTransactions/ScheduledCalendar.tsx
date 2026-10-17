import { buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { ScheduledTransaction } from "@/types/electron";
import { useMemo } from "react";
import { getDefaultClassNames, labelGridcell } from "react-day-picker";

type ScheduledCalendarProps = {
  scheduledTransactions: ScheduledTransaction[];
  /** Account scope shared with the list and summary. */
  scopeLabel?: string;
  className?: string;
};

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/**
 * Read-only month view. Dots mark each active schedule's next due date, not
 * every future recurrence. Days are not interactive: selecting a date does
 * not filter or record anything.
 */
export function ScheduledCalendar({
  scheduledTransactions,
  scopeLabel = "All accounts",
  className,
}: ScheduledCalendarProps) {
  const dueDates = useMemo(() => {
    const unique = new Set(
      scheduledTransactions
        .filter((s) => s.active && s.nextDueDate)
        .map((s) => s.nextDueDate!),
    );
    return [...unique].map(parseLocalDate);
  }, [scheduledTransactions]);
  const defaults = getDefaultClassNames();
  const navButton = cn(
    buttonVariants({ variant: "ghost" }),
    "size-11 p-0 select-none aria-disabled:opacity-50 lg:size-7",
  );

  return (
    <section
      aria-label="Next due dates calendar"
      data-slot="scheduled-calendar"
      className={cn("rounded-lg border border-border bg-card p-3", className)}
    >
      <p className="text-xs tracking-wider text-muted-foreground uppercase">
        Next due dates
        <span className="normal-case"> · {scopeLabel}</span>
      </p>
      <Calendar
        className="w-full bg-transparent p-0 pt-2 [--cell-size:--spacing(9)] lg:[--cell-size:--spacing(7)]"
        classNames={{
          root: cn("w-full", defaults.root),
          button_previous: cn(navButton, defaults.button_previous),
          button_next: cn(navButton, defaults.button_next),
          day: cn(
            "group/day relative flex aspect-square w-full items-center justify-center rounded-(--cell-radius) p-0 text-sm select-none",
            defaults.day,
          ),
        }}
        modifiers={{ due: dueDates }}
        modifiersClassNames={{
          due: "font-semibold after:absolute after:bottom-1 after:left-1/2 after:size-1.5 after:-translate-x-1/2 after:rounded-full after:bg-primary after:content-['']",
        }}
        labels={{
          labelGridcell: (date, modifiers, options, dateLib) =>
            `${labelGridcell(date, modifiers, options, dateLib)}${
              modifiers?.due ? ", payment due" : ""
            }`,
        }}
        showOutsideDays={false}
      />
      <p className="pt-2 text-xs text-muted-foreground">
        A dot marks a schedule&apos;s next due date.
      </p>
    </section>
  );
}
