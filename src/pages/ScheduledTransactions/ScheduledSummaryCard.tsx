import { Amount } from "@/components/ui/amount";
import type { ScheduledTransaction } from "@/types/electron";
import { useMemo } from "react";

type ScheduledSummaryCardProps = {
  scheduledTransactions: ScheduledTransaction[];
};

export function ScheduledSummaryCard({
  scheduledTransactions,
}: ScheduledSummaryCardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today);
  in7.setDate(today.getDate() + 7);

  const { total, dueSoon } = useMemo(() => {
    const active = scheduledTransactions.filter((s) => s.active);
    const total = active.reduce((acc, s) => acc + Math.abs(s.amount), 0);
    const dueSoon = active.filter((s) => {
      if (!s.nextDueDate) return false;
      const d = new Date(s.nextDueDate);
      return d >= today && d <= in7;
    }).length;
    return { total, dueSoon };
  }, [scheduledTransactions]);

  return (
    <div className="rounded-lg border border-border bg-primary/5 p-4 flex flex-col gap-3">
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
          Total Scheduled
        </p>
        <Amount value={-total} />
      </div>
      <div className="border-t border-border/50 pt-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{dueSoon}</span> due
          in next 7 days
        </p>
      </div>
    </div>
  );
}
