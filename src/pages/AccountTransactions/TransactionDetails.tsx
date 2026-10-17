import { Amount } from "@/components/ui/amount";
import type { Category, Transaction } from "@/types/electron";

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function transactionStatus(tx: Transaction, today: string): string {
  if (tx.reconciled) return "Reconciled";
  if (tx.cleared) return "Cleared";
  if (tx.date > today) return "Scheduled (future)";
  return "Uncleared";
}

type TransactionDetailsProps = {
  transaction: Transaction;
  category?: Category | null;
  accountName?: string;
};

/** Read-only summary shown before an explicit Edit. Contains no inputs. */
export function TransactionDetails({
  transaction: tx,
  category,
  accountName,
}: TransactionDetailsProps) {
  const today = new Date().toISOString().slice(0, 10);
  const status = transactionStatus(tx, today);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold break-words">{tx.payee}</p>
          <p className="text-sm text-muted-foreground">
            {accountName ? `${accountName} · ${status}` : status}
          </p>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums">
          <Amount value={tx.amount} />
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
        <dt className="text-muted-foreground">Date</dt>
        <dd>
          <time dateTime={tx.date}>
            {LONG_DATE.format(new Date(`${tx.date}T00:00:00Z`))}
          </time>
        </dd>
        <dt className="text-muted-foreground">Category</dt>
        <dd>{category?.name ?? "Uncategorised"}</dd>
        {tx.transferTransactionId != null && (
          <>
            <dt className="text-muted-foreground">Type</dt>
            <dd>Transfer</dd>
          </>
        )}
        <dt className="text-muted-foreground">Notes</dt>
        <dd className="whitespace-pre-wrap break-words">
          {tx.notes?.trim() ? (
            tx.notes
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </dd>
      </dl>
      {tx.reconciled && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Reconciled transactions can't be edited.
        </p>
      )}
    </div>
  );
}
