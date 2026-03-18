import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccounts } from "@/hooks/useAccounts";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTransactions } from "@/hooks/useTransactions";
import { formatDate } from "@/lib/utils";
import { TransactionForm } from "@/pages/AccountTransactions/TransactionForm";
import { ArrowLeftIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import Layout from "../layout";

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

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
  const [originallyCleared, setOriginallyCleared] = useState<Set<number>>(
    new Set(),
  );
  const initialized = useRef(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

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
      const cleared = new Set(
        eligibleTransactions.filter((t) => t.cleared).map((t) => t.id),
      );
      setCheckedIds(cleared);
      setOriginallyCleared(cleared);
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
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
  }

  function openAdd() {
    setEditingId(null);
    setSheetOpen(true);
  }

  function openEdit(txId: number) {
    setEditingId(txId);
    setSheetOpen(true);
  }

  async function handleFinish() {
    if (!isBalanced) return;
    const toUnclear = [...originallyCleared].filter(
      (txId) => !checkedIds.has(txId),
    );
    await reconcile.mutateAsync({
      toReconcile: [...checkedIds],
      toUnclear,
      checkpoint: {
        accountId,
        date: statementDate,
        balance: statementBalance,
        notes: null,
      },
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

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-y-auto pb-20">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate(`/accounts/${accountId}`)}
              aria-label="Go back"
            >
              <ArrowLeftIcon />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Reconcile — {account?.name ?? "—"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Statement: {formatDate(statementDate)} — {fmt(statementBalance)}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={openAdd}>
            <PlusIcon />
            Add Transaction
          </Button>
        </div>

        {/* Balance summary */}
        <div className="grid grid-cols-4 gap-3 px-4 py-3">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs">Opening Balance</p>
            <p className="font-medium tabular-nums">{fmt(openingBalance)}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs">Cleared Balance</p>
            <p className="font-medium tabular-nums">{fmt(clearedBalance)}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs">Statement Balance</p>
            <p className="font-medium tabular-nums">{fmt(statementBalance)}</p>
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs">Difference</p>
            <p
              className={`font-medium tabular-nums ${isBalanced ? "text-green-600" : "text-destructive"}`}
            >
              {difference !== null
                ? isBalanced
                  ? "£0.00"
                  : fmt(difference)
                : "—"}
            </p>
          </div>
        </div>

        {/* Transaction table */}
        <div className="px-4">
          <div className="border border-border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-center bg-accent w-10" />
                  <TableHead className="bg-accent">Date</TableHead>
                  <TableHead className="bg-accent">Payee</TableHead>
                  <TableHead className="text-right bg-accent">
                    Withdrawal
                  </TableHead>
                  <TableHead className="text-right bg-accent">
                    Deposit
                  </TableHead>
                  <TableHead className="bg-accent">Category</TableHead>
                  <TableHead className="bg-accent">Notes</TableHead>
                  <TableHead className="bg-accent" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {eligibleTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-12"
                    >
                      No unreconciled transactions for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  eligibleTransactions.map((tx) => {
                    const category = tx.categoryId
                      ? categoryMap.get(tx.categoryId)
                      : null;
                    const checked = checkedIds.has(tx.id);
                    return (
                      <TableRow
                        key={tx.id}
                        className={`cursor-pointer${checked ? " bg-primary/25" : ""}`}
                        onClick={() => toggleChecked(tx.id)}
                      >
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleChecked(tx.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-pointer accent-blue-500 size-4"
                          />
                        </TableCell>
                        <TableCell>{formatDate(tx.date)}</TableCell>
                        <TableCell>{tx.payee}</TableCell>
                        <TableCell className="text-right">
                          {tx.amount < 0 ? <Amount value={tx.amount} /> : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {tx.amount > 0 ? <Amount value={tx.amount} /> : null}
                        </TableCell>
                        <TableCell>
                          {category ? (
                            <Badge variant="secondary">{category.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                          {tx.notes ?? ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(tx.id);
                            }}
                            aria-label="Edit transaction"
                          >
                            <PencilIcon />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-between gap-3 px-4 py-3 border-t bg-background">
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

      <TransactionForm
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingId={editingId}
        accountId={accountId}
        defaultDate={statementDate}
        defaultCleared
      />
    </Layout>
  );
}
