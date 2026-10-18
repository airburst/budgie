import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ForecastRow } from "@/lib/forecast";
import { cn, formatDate } from "@/lib/utils";
import type { Category } from "@/types/electron";
import { CheckIcon, InfoIcon } from "lucide-react";
import { useId } from "react";

export type ForecastRowWithBalance = ForecastRow & {
  included: boolean;
  runningBalance: number;
};

type Props = {
  rows: ForecastRowWithBalance[];
  categoryMap: Map<number, Category>;
  onToggleRow: (key: string) => void;
  onShowDetails: (key: string) => void;
};

// Phone: check | payee + meta | amount. Desktop: check / date / payee /
// category / amount / balance / details, aligned by the shared tracks.
const LIST_COLUMNS =
  "grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 lg:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,12rem)_auto_auto_auto] lg:gap-x-4";

export function ForecastTransactionList({
  rows,
  categoryMap,
  onToggleRow,
  onShowDetails,
}: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border py-12 text-center text-muted-foreground">
        No projected transactions in this period.
      </div>
    );
  }

  return (
    <div className={cn("grid gap-y-2", LIST_COLUMNS)}>
      {/* Visual column captions only; each card carries its own labels. */}
      <div
        aria-hidden="true"
        className="col-span-full hidden grid-cols-subgrid px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid"
      >
        <span className="w-5" />
        <span>Date</span>
        <span>Payee</span>
        <span>Category</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Balance</span>
        <span className="sr-only">Actions</span>
      </div>
      <ul
        aria-label="Projected transactions"
        className="col-span-full grid grid-cols-subgrid gap-y-2"
      >
        {rows.map((row) => (
          <ForecastCard
            key={row.key}
            row={row}
            categoryName={
              row.categoryId ? categoryMap.get(row.categoryId)?.name : undefined
            }
            onToggle={() => onToggleRow(row.key)}
            onShowDetails={() => onShowDetails(row.key)}
          />
        ))}
      </ul>
    </div>
  );
}

type CardProps = {
  row: ForecastRowWithBalance;
  categoryName?: string;
  onToggle: () => void;
  onShowDetails: () => void;
};

function ForecastCard({
  row,
  categoryName,
  onToggle,
  onShowDetails,
}: CardProps) {
  const checkboxId = useId();
  const metadata = [formatDate(row.date), row.isScheduled ? "Scheduled" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      data-slot="forecast-card"
      data-included={row.included}
      className={cn(
        "relative col-span-full grid grid-cols-subgrid items-start gap-y-1 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50 lg:items-center has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
        row.isScheduled && "italic",
        !row.included && "bg-muted/40 text-muted-foreground",
      )}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={row.included}
        onChange={onToggle}
        className="col-start-1 row-start-1 mt-0.5 size-5 cursor-pointer accent-blue-500 lg:mt-0"
      />
      <div className="col-start-2 row-start-1 min-w-0 lg:col-start-3">
        {/* The label's pseudo-element makes the whole card one native toggle. */}
        <label
          htmlFor={checkboxId}
          className="block cursor-pointer font-medium break-words after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {row.payee}
          <span className="sr-only">, include in forecast</span>
        </label>
        <p
          className={cn(
            "flex items-center gap-1 text-xs font-medium",
            row.included ? "text-primary" : "text-muted-foreground",
          )}
        >
          {row.included ? (
            <>
              <CheckIcon className="size-3.5" />
              Included
            </>
          ) : (
            "Excluded from forecast"
          )}
        </p>
      </div>
      <p
        data-slot="forecast-amount"
        className="col-start-3 row-start-1 text-right font-semibold tabular-nums lg:col-start-5"
      >
        <span className="sr-only">Amount </span>
        <Amount value={row.amount} />
      </p>

      {/* Phone: date · scheduled label, then the projected balance. */}
      <p className="col-start-2 text-xs text-muted-foreground lg:hidden">
        {metadata}
      </p>
      <p
        data-slot="forecast-balance"
        className="col-start-2 text-xs text-muted-foreground tabular-nums lg:hidden"
      >
        Projected balance{" "}
        {row.included ? (
          <span className="font-medium">
            <Amount value={row.runningBalance} />
          </span>
        ) : (
          "—"
        )}
      </p>

      {/* Desktop columns. */}
      <div className="col-start-2 row-start-1 hidden lg:block">
        <p>{formatDate(row.date)}</p>
        {row.isScheduled && (
          <p className="text-xs text-muted-foreground">Scheduled</p>
        )}
      </div>
      <p className="col-start-4 row-start-1 hidden lg:block">
        {categoryName ? (
          <Badge variant="secondary">{categoryName}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </p>
      <p className="col-start-6 row-start-1 hidden text-right tabular-nums lg:block">
        <span className="sr-only">Projected balance </span>
        {row.included ? (
          <Amount value={row.runningBalance} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </p>

      {/* Details is an independent sibling above the card-wide label. */}
      <div className="relative z-10 col-start-3 row-span-2 row-start-2 flex justify-end self-end lg:col-start-7 lg:row-span-1 lg:row-start-1 lg:self-center">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onShowDetails}
          aria-label={`Details for ${row.payee}`}
          title="Details"
        >
          <InfoIcon />
        </Button>
      </div>
    </li>
  );
}
