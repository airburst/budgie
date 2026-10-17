import { Amount } from "@/components/ui/amount";
import { cn } from "@/lib/utils";
import type { ScheduledTransaction } from "@/types/electron";
import { useMemo } from "react";
import { summarizeDueSoon } from "./scheduled-display";

type ScheduledSummaryCardProps = {
  scheduledTransactions: ScheduledTransaction[];
  /** Account scope shared with the list and calendar, e.g. "All accounts". */
  scopeLabel?: string;
  className?: string;
};

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

/**
 * Income and Outgoing are separate totals and are never netted. A side with
 * nothing due shows zero explicitly.
 */
export function ScheduledSummaryCard({
  scheduledTransactions,
  scopeLabel = "All accounts",
  className,
}: ScheduledSummaryCardProps) {
  const { income, outgoing, count } = useMemo(
    () => summarizeDueSoon(scheduledTransactions),
    [scheduledTransactions],
  );

  return (
    <section
      aria-labelledby="scheduled-summary-heading"
      data-slot="scheduled-summary"
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <div>
        <h2
          id="scheduled-summary-heading"
          className="text-xs tracking-wider text-muted-foreground uppercase"
        >
          Due in next 7 days
        </h2>
        <p className="text-xs text-muted-foreground">{scopeLabel}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Income</dt>
          <dd
            data-slot="summary-income"
            className="text-lg font-semibold tabular-nums"
          >
            {income > 0 ? (
              <Amount value={income} />
            ) : (
              <span className="text-muted-foreground">{GBP.format(0)}</span>
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Outgoing</dt>
          <dd
            data-slot="summary-outgoing"
            className="text-lg font-semibold tabular-nums"
          >
            {outgoing > 0 ? (
              <span className="text-red-600">{GBP.format(outgoing)}</span>
            ) : (
              <span className="text-muted-foreground">{GBP.format(0)}</span>
            )}
          </dd>
        </div>
      </dl>
      <div className="border-t border-border/50 pt-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{count}</span>{" "}
          {count === 1 ? "transaction" : "transactions"}
        </p>
      </div>
    </section>
  );
}
