import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/hooks/useAccounts";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTransactions } from "@/hooks/useTransactions";
import { findSubsetSum } from "@/lib/subset-sum";
import { cn, formatDate } from "@/lib/utils";
import { TransactionForm } from "@/pages/AccountTransactions/TransactionForm";
import type { Transaction } from "@/types/electron";
import {
  ArrowLeftIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  ScaleIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Layout from "../layout";

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

// Phone: check | payee | amount. Desktop: check / date / payee / category / amount / edit.
const LIST_COLUMNS =
  "grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 lg:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] lg:gap-x-4";

export default function ReconcilePage() {
  const { id } = useParams<{ id: string }>();
  const accountId = Number(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const statementDate = searchParams.get("date") ?? "";
  const statementBalance = parseFloat(searchParams.get("balance") ?? "");

  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const { transactions, categories, reconcile } = useTransactions(accountId);

  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const initialized = useRef(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [focusAmountOnOpen, setFocusAmountOnOpen] = useState(false);
  const [defaultAmount, setDefaultAmount] = useState<number>();
  const [isAutoBalance, setIsAutoBalance] = useState(false);
  const [autoMatchBanner, setAutoMatchBanner] = useState<{
    count: number;
  } | null>(null);

  const eligibleTransactions = useMemo(
    () => transactions.filter((t) => !t.reconciled && t.date <= statementDate),
    [transactions, statementDate],
  );

  const knownIds = useRef<Set<number>>(new Set());

  // Initialize checked state from already-cleared transactions (once)
  // After init, auto-check any newly appearing cleared transactions
  useEffect(() => {
    if (eligibleTransactions.length === 0) return;
    if (!initialized.current) {
      const target = statementBalance - openingBalance;
      const canAutoMatch =
        !isNaN(target) && target !== 0 && eligibleTransactions.length <= 30;

      if (canAutoMatch) {
        const amounts = eligibleTransactions.map((t) => t.amount);
        const result = findSubsetSum(amounts, target);
        if (result.found) {
          const matchedIds = new Set(
            result.indices.map((i) => eligibleTransactions[i]!.id),
          );
          setCheckedIds(matchedIds);
          setAutoMatchBanner({ count: result.indices.length });
          knownIds.current = new Set(eligibleTransactions.map((t) => t.id));
          initialized.current = true;
          return;
        }
      }

      const cleared = new Set(
        eligibleTransactions.filter((t) => t.cleared).map((t) => t.id),
      );
      setCheckedIds(cleared);
      knownIds.current = new Set(eligibleTransactions.map((t) => t.id));
      initialized.current = true;
    } else {
      const newCleared = eligibleTransactions.filter(
        (t) => !knownIds.current.has(t.id) && t.cleared,
      );
      if (newCleared.length > 0) {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          for (const t of newCleared) next.add(t.id);
          return next;
        });
      }
      knownIds.current = new Set(eligibleTransactions.map((t) => t.id));
    }
  }, [eligibleTransactions]);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const openingBalance = account?.lastReconcileBalance ?? account?.balance ?? 0;

  const clearedBalance = useMemo(() => {
    let sum = 0;
    for (const t of eligibleTransactions) {
      if (checkedIds.has(t.id)) sum += t.amount;
    }
    return openingBalance + sum;
  }, [eligibleTransactions, checkedIds, openingBalance]);

  const difference = isNaN(statementBalance)
    ? null
    : statementBalance - clearedBalance;
  const isBalanced = difference !== null && Math.abs(difference) < 0.005;

  // Redirect if params invalid
  if (!statementDate || isNaN(statementBalance)) {
    navigate(`/accounts/${accountId}`, { replace: true });
    return null;
  }

  function toggleChecked(txId: number) {
    const nowChecked = !checkedIds.has(txId);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (nowChecked) next.add(txId);
      else next.delete(txId);
      return next;
    });
    // Persist cleared state immediately so it survives navigation away and back
    window.api.updateTransaction(txId, { cleared: nowChecked });
  }

  function openAdd() {
    setEditingId(null);
    setFocusAmountOnOpen(false);
    setDefaultAmount(undefined);
    setIsAutoBalance(false);
    setSheetOpen(true);
  }

  function openAutoBalance() {
    if (difference === null || isBalanced) return;
    setEditingId(null);
    setFocusAmountOnOpen(false);
    setDefaultAmount(difference);
    setIsAutoBalance(true);
    setSheetOpen(true);
  }

  function openEdit(txId: number, options?: { focusAmount?: boolean }) {
    setEditingId(txId);
    setFocusAmountOnOpen(!!options?.focusAmount);
    setDefaultAmount(undefined);
    setIsAutoBalance(false);
    setSheetOpen(true);
  }

  function handleSheetOpenChange(open: boolean) {
    setSheetOpen(open);
    if (!open) {
      setFocusAmountOnOpen(false);
      setDefaultAmount(undefined);
      setIsAutoBalance(false);
    }
  }

  async function handleFinish() {
    if (!isBalanced) return;
    await reconcile.mutateAsync({
      toReconcile: [...checkedIds],
      toUnclear: [],
      checkpoint: {
        accountId,
        date: statementDate,
        balance: statementBalance,
        notes: null,
      },
    });
    await window.api.updateAccount(accountId, {
      pendingReconcileBalance: null,
      pendingReconcileDate: null,
    });
    navigate(`/accounts/${accountId}`);
  }

  useHotkeys(
    [
      { key: "n", handler: () => openAdd() },
      { key: "Escape", handler: () => navigate(`/accounts/${accountId}`) },
      ...(isBalanced && !reconcile.isPending
        ? [{ key: "Enter", handler: () => handleFinish() }]
        : []),
    ],
    !sheetOpen,
  );

  const selectedCount = eligibleTransactions.filter((t) =>
    checkedIds.has(t.id),
  ).length;
  const differenceText =
    difference !== null ? (isBalanced ? "£0.00" : fmt(difference)) : "—";
  const differenceClass = isBalanced ? "text-green-600" : "text-destructive";

  return (
    <Layout>
      {/* The task bar is fixed, so the page reserves its height plus the safe
          area; the last card scrolls clear of it. */}
      <div className="flex flex-col pb-[calc(9.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-4 pb-2">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate(`/accounts/${accountId}`)}
              aria-label="Go back"
            >
              <ArrowLeftIcon />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight break-words sm:text-2xl">
                Reconcile — {account?.name ?? "—"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Statement: {formatDate(statementDate)} — {fmt(statementBalance)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={openAutoBalance}
              disabled={isBalanced}
            >
              <ScaleIcon />
              Auto Balance
            </Button>
            <Button size="sm" onClick={openAdd}>
              <PlusIcon />
              Add Transaction
            </Button>
          </div>
        </div>

        {/* Balance summary: two-by-two on phones, one row from lg. */}
        <div
          data-slot="reconcile-summary"
          className="grid grid-cols-2 gap-3 px-4 py-3 lg:grid-cols-4"
        >
          <SummaryTile label="Opening Balance" value={fmt(openingBalance)} />
          <SummaryTile label="Cleared Balance" value={fmt(clearedBalance)} />
          <SummaryTile
            label="Statement Balance"
            value={fmt(statementBalance)}
          />
          <SummaryTile
            label="Difference"
            value={differenceText}
            valueClassName={differenceClass}
            caption={
              difference === null
                ? undefined
                : isBalanced
                  ? "Balanced"
                  : "Not balanced"
            }
          />
        </div>

        {/* Auto-match banner */}
        {autoMatchBanner !== null && (
          <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <span>
              Auto-matched {autoMatchBanner.count} transaction
              {autoMatchBanner.count !== 1 ? "s" : ""} to your target balance.
              Verify and adjust as needed.
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setAutoMatchBanner(null)}
              aria-label="Dismiss"
              className="shrink-0 text-blue-800 hover:bg-blue-100 hover:text-blue-900 dark:text-blue-200 dark:hover:bg-blue-900"
            >
              <XIcon />
            </Button>
          </div>
        )}

        {/* Transactions */}
        <div className="px-4">
          {eligibleTransactions.length === 0 ? (
            <div className="rounded-md border border-border py-12 text-center text-muted-foreground">
              No unreconciled transactions for this period.
            </div>
          ) : (
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
                <span className="sr-only">Actions</span>
              </div>
              <ul className="col-span-full grid grid-cols-subgrid gap-y-2">
                {eligibleTransactions.map((tx) => (
                  <ReconcileCard
                    key={tx.id}
                    tx={tx}
                    categoryName={
                      tx.categoryId
                        ? categoryMap.get(tx.categoryId)?.name
                        : undefined
                    }
                    checked={checkedIds.has(tx.id)}
                    onToggle={() => toggleChecked(tx.id)}
                    onEdit={(options) => openEdit(tx.id, options)}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Task bar */}
      <div
        role="group"
        aria-label="Reconciliation actions"
        data-slot="reconcile-task-bar"
        className="fixed right-0 bottom-0 left-0 z-20 flex flex-col gap-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 text-sm sm:justify-start">
          <span>
            <span className="font-medium tabular-nums">{selectedCount}</span>{" "}
            selected
          </span>
          <span>
            Difference{" "}
            <span className={cn("font-medium tabular-nums", differenceClass)}>
              {differenceText}
            </span>
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Button
            variant="outline"
            onClick={() => navigate(`/accounts/${accountId}`)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleFinish}
            disabled={!isBalanced || reconcile.isPending}
          >
            Finish
          </Button>
        </div>
      </div>

      <TransactionForm
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        editingId={editingId}
        accountId={accountId}
        account={account}
        defaultDate={statementDate}
        defaultCleared
        defaultAmount={defaultAmount}
        focusAmountOnOpen={focusAmountOnOpen}
        autoBalance={isAutoBalance}
      />
    </Layout>
  );
}

type SummaryTileProps = {
  label: string;
  value: string;
  valueClassName?: string;
  caption?: string;
};

function SummaryTile({
  label,
  value,
  valueClassName,
  caption,
}: SummaryTileProps) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("font-medium tabular-nums break-words", valueClassName)}>
        {value}
      </p>
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

type ReconcileCardProps = {
  tx: Transaction;
  categoryName?: string;
  checked: boolean;
  onToggle: () => void;
  onEdit: (options?: { focusAmount?: boolean }) => void;
};

function ReconcileCard({
  tx,
  categoryName,
  checked,
  onToggle,
  onEdit,
}: ReconcileCardProps) {
  const checkboxId = useId();
  const metadata = [formatDate(tx.date), categoryName]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      data-slot="reconcile-card"
      data-selected={checked}
      onDoubleClick={(e) => {
        // Desktop shortcut kept from the table; never from the Edit button.
        if ((e.target as Element).closest("button")) return;
        onEdit({ focusAmount: true });
      }}
      className={cn(
        "relative col-span-full grid grid-cols-subgrid items-start gap-y-1 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/50 lg:items-center has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
        checked && "border-primary bg-primary/10 hover:bg-primary/15",
      )}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="col-start-1 row-start-1 mt-0.5 size-5 cursor-pointer accent-blue-500 lg:mt-0"
      />
      <div className="col-start-2 row-start-1 min-w-0 lg:col-start-3">
        {/* The label's pseudo-element makes the whole card one native toggle. */}
        <label
          htmlFor={checkboxId}
          className="block cursor-pointer font-medium break-words after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          {tx.payee}
        </label>
        {checked && (
          <p className="flex items-center gap-1 text-xs font-medium text-primary">
            <CheckIcon className="size-3.5" />
            Selected
          </p>
        )}
        {tx.notes?.trim() && (
          <p className="truncate text-xs text-muted-foreground">{tx.notes}</p>
        )}
      </div>
      <p
        data-slot="reconcile-amount"
        className="col-start-3 row-start-1 text-right font-semibold tabular-nums lg:col-start-5"
      >
        <span className="sr-only">Amount </span>
        <Amount value={tx.amount} />
      </p>

      {/* Phone: date · category. */}
      <p className="col-start-2 text-xs text-muted-foreground lg:hidden">
        {metadata}
      </p>

      {/* Desktop columns. */}
      <p className="col-start-2 row-start-1 hidden lg:block">
        {formatDate(tx.date)}
      </p>
      <p className="col-start-4 row-start-1 hidden lg:block">
        {categoryName ? (
          <Badge variant="secondary">{categoryName}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </p>

      {/* Edit is an independent sibling above the card-wide label. */}
      <div className="relative z-10 col-start-3 row-start-2 flex justify-end lg:col-start-6 lg:row-start-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onEdit()}
          aria-label={`Edit ${tx.payee}`}
          title="Edit"
        >
          <PencilIcon />
        </Button>
      </div>
    </li>
  );
}
