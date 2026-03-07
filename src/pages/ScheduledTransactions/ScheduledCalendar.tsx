import { Button } from "@/components/ui/button";
import type { ScheduledTransaction } from "@/types/electron";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

type ScheduledCalendarProps = {
  scheduledTransactions: ScheduledTransaction[];
};

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function ScheduledCalendar({
  scheduledTransactions,
}: ScheduledCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const dueDates = new Set(
    scheduledTransactions
      .filter((s) => s.active && s.nextDueDate)
      .map((s) => s.nextDueDate!),
  );

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) =>
    day === now.getDate() &&
    month === now.getMonth() &&
    year === now.getFullYear();

  const hasDot = (day: number) => {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return dueDates.has(iso);
  };

  return (
    <div className="rounded-lg border border-border p-3 select-none">
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon-sm" onClick={prevMonth}>
          <ChevronLeftIcon />
        </Button>
        <span className="text-sm font-semibold">
          {MONTHS[month]} {year}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={nextMonth}>
          <ChevronRightIcon />
        </Button>
      </div>

      <div className="grid grid-cols-7 text-center mb-1">
        {DAYS.map((d) => (
          <span
            key={d}
            className="text-xs text-muted-foreground font-medium py-1"
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 text-center gap-y-0.5">
        {cells.map((day, i) => (
          <div key={i} className="flex flex-col items-center py-0.5">
            {day !== null ? (
              <>
                <span
                  className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday(day)
                      ? "bg-primary text-primary-foreground font-bold"
                      : "text-foreground"
                  }`}
                >
                  {day}
                </span>
                {hasDot(day) && (
                  <span className="size-1 rounded-full bg-primary mt-0.5" />
                )}
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
