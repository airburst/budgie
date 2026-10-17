import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { computeRunningBalances } from "@/lib/balances";
import { cn, formatDate } from "@/lib/utils";
import type { Category, Transaction } from "@/types/electron";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

type TransactionsListProps = {
  transactions: Transaction[];
  allTransactions: Transaction[];
  categories: Category[];
  openingBalance: number;
  onEdit: (id: number, options?: { focusAmount?: boolean }) => void;
  /** Tapping a card (outside its controls) opens read-only details. */
  onView: (id: number) => void;
  onDelete: (id: number) => void;
  onToggleCleared: (id: number, cleared: boolean) => void;
};

// Phone: payee | amount. Desktop: date / payee / category / amount / balance / status / actions.
const LIST_COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto] gap-x-3 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto_auto] lg:gap-x-4";

function transactionStatusText(tx: Transaction): string {
  if (tx.reconciled) return "Reconciled";
  if (tx.cleared) return "Cleared";
  return "Uncleared";
}

export function TransactionsList({
  transactions,
  allTransactions,
  categories,
  openingBalance,
  onEdit,
  onView,
  onDelete,
  onToggleCleared,
}: TransactionsListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const runningBalances = useMemo(
    () => computeRunningBalances(allTransactions, openingBalance),
    [allTransactions, openingBalance],
  );

  const today = new Date().toISOString().slice(0, 10);
  const futureBoundaryIndex = transactions.findIndex((tx) => tx.date > today);

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border py-12 text-center">
        <p className="text-muted-foreground">No transactions yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className={cn("grid gap-y-2", LIST_COLUMNS)}>
        {/* Visual column captions only; each card carries its own labels. */}
        <div
          aria-hidden="true"
          className="col-span-full hidden grid-cols-subgrid px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid"
        >
          <span>Date</span>
          <span>Payee</span>
          <span>Category</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Balance</span>
          <span>Status</span>
          <span className="sr-only">Actions</span>
        </div>
        <ul className="col-span-full grid grid-cols-subgrid gap-y-2">
          {transactions.map((tx, i) => {
            const category = tx.categoryId
              ? categoryMap.get(tx.categoryId)
              : null;
            const balance = runningBalances.get(tx.id) ?? openingBalance;

            return (
              <Fragment key={tx.id}>
                {i === futureBoundaryIndex && (
                  <li className="col-span-full px-1 pt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Upcoming
                  </li>
                )}
                <TransactionCard
                  tx={tx}
                  category={category}
                  balance={balance}
                  today={today}
                  onView={onView}
                  onEdit={onEdit}
                  onDeleteRequest={() => setPendingDeleteId(tx.id)}
                  onToggleCleared={onToggleCleared}
                />
              </Fragment>
            );
          })}
        </ul>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Delete transaction?"
        description="This will permanently delete this transaction. This action cannot be undone."
        onConfirm={() => onDelete(pendingDeleteId!)}
      />
    </>
  );
}

type TransactionCardProps = {
  tx: Transaction;
  category: Category | null | undefined;
  balance: number;
  today: string;
  onView: (id: number) => void;
  onEdit: (id: number, options?: { focusAmount?: boolean }) => void;
  onDeleteRequest: () => void;
  onToggleCleared: (id: number, cleared: boolean) => void;
};

function TransactionCard({
  tx,
  category,
  balance,
  today,
  onView,
  onEdit,
  onDeleteRequest,
  onToggleCleared,
}: TransactionCardProps) {
  const isReconciled = tx.reconciled;
  const isFuture = tx.date > today;
  // Running balance is only meaningful for still-outstanding activity.
  const showsBalance = !isReconciled && !tx.cleared;
  const status = transactionStatusText(tx);
  const metadata = [formatDate(tx.date), category?.name, status]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      data-slot="transaction-card"
      className={cn(
        "relative col-span-full grid grid-cols-subgrid items-start gap-y-1 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50 lg:items-center has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring",
        isReconciled && "opacity-60",
      )}
    >
      {/* Whole-card tap opens read-only details on every width. */}
      <button
        type="button"
        onClick={() => onView(tx.id)}
        className="col-start-1 row-start-1 min-w-0 truncate text-left font-medium outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] lg:col-start-2"
      >
        {tx.payee}
      </button>
      <p
        data-slot="transaction-amount"
        className="col-start-2 row-start-1 text-right font-semibold tabular-nums lg:col-start-4"
      >
        <span className="sr-only">Amount </span>
        <Amount value={tx.amount} />
      </p>

      {/* Phone: date · category · status */}
      <div className="col-span-full flex flex-wrap items-center justify-between gap-2 lg:hidden">
        <span className="text-xs text-muted-foreground">{metadata}</span>
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          <ClearedControl
            tx={tx}
            isFuture={isFuture}
            onToggleCleared={onToggleCleared}
          />
          {!isReconciled && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-8"
                    aria-label={`More actions for ${tx.payee}`}
                  />
                }
              >
                <MoreHorizontalIcon className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  className="min-h-11 md:min-h-8"
                  onClick={() => onEdit(tx.id)}
                >
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11 md:min-h-8"
                  variant="destructive"
                  onClick={onDeleteRequest}
                >
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {tx.notes?.trim() && (
        <p className="col-span-full truncate text-xs text-muted-foreground lg:hidden">
          {tx.notes}
        </p>
      )}

      {showsBalance && (
        <p className="col-span-full text-xs tabular-nums text-muted-foreground lg:hidden">
          <span className="font-medium text-foreground">Balance </span>
          <Amount value={balance} />
        </p>
      )}

      {/* Desktop-only columns; phone equivalents live above. */}
      <p className="col-start-1 row-start-1 hidden lg:block">
        {formatDate(tx.date)}
      </p>
      <p className="col-start-3 row-start-1 hidden lg:block">
        {category ? (
          <Badge variant="secondary">{category.name}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </p>
      <p className="col-start-5 row-start-1 hidden text-right tabular-nums lg:block">
        {showsBalance ? (
          <Amount value={balance} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </p>
      <p className="col-start-6 row-start-1 hidden text-sm text-muted-foreground lg:block">
        {status}
      </p>
      <div className="relative z-10 col-start-7 row-start-1 hidden items-center justify-end gap-2 lg:flex">
        <ClearedControl
          tx={tx}
          isFuture={isFuture}
          onToggleCleared={onToggleCleared}
        />
        {!isReconciled && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Edit"
              aria-label={`Edit ${tx.payee}`}
              onClick={() => onEdit(tx.id)}
            >
              <PencilIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Delete"
              aria-label={`Delete ${tx.payee}`}
              onClick={onDeleteRequest}
            >
              <Trash2Icon className="size-4 text-destructive" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

type ClearedControlProps = {
  tx: Transaction;
  isFuture: boolean;
  onToggleCleared: (id: number, cleared: boolean) => void;
};

function ClearedControl({ tx, isFuture, onToggleCleared }: ClearedControlProps) {
  if (tx.reconciled) return null;

  return (
    <label className="flex size-11 shrink-0 items-center justify-center md:size-8">
      <input
        type="checkbox"
        aria-label={`Mark ${tx.payee} cleared`}
        checked={!!tx.cleared}
        disabled={isFuture}
        onChange={(e) => onToggleCleared(tx.id, e.target.checked)}
        className={cn(
          "size-4",
          isFuture ? "cursor-not-allowed opacity-30" : "cursor-pointer",
        )}
      />
    </label>
  );
}
