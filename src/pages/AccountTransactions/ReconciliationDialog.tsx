import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTransactions } from "@/hooks/useTransactions";
import { formatDate } from "@/lib/utils";
import type { AccountWithBalances, Transaction } from "@/types/electron";
import { useMemo, useState } from "react";

type ReconciliationDialogProps = {
  account: AccountWithBalances;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Step = "initiate" | "match";

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

export function ReconciliationDialog({
  account,
  open,
  onOpenChange,
}: ReconciliationDialogProps) {
  const { transactions, reconcile } = useTransactions(account.id);

  const [step, setStep] = useState<Step>("initiate");
  const [statementDate, setStatementDate] = useState("");
  const [statementBalanceStr, setStatementBalanceStr] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [originallyCleared, setOriginallyCleared] = useState<Set<number>>(
    new Set(),
  );

  const parsedBalance = parseFloat(statementBalanceStr);
  const hasValidBalance = statementBalanceStr !== "" && !isNaN(parsedBalance);
  const canAdvance = !!statementDate && hasValidBalance;

  const eligibleTransactions = useMemo(
    () => transactions.filter((t) => !t.reconciled && t.date <= statementDate),
    [transactions, statementDate],
  );

  const debits = useMemo(
    () => eligibleTransactions.filter((t) => t.amount < 0),
    [eligibleTransactions],
  );

  const credits = useMemo(
    () => eligibleTransactions.filter((t) => t.amount >= 0),
    [eligibleTransactions],
  );

  const openingBalance = account.lastReconcileBalance ?? account.balance;

  const clearedBalance = useMemo(() => {
    let sum = 0;
    for (const t of eligibleTransactions) {
      if (checkedIds.has(t.id)) sum += t.amount;
    }
    return openingBalance + sum;
  }, [eligibleTransactions, checkedIds, openingBalance]);

  const difference = hasValidBalance ? parsedBalance - clearedBalance : null;
  const isBalanced = difference !== null && Math.abs(difference) < 0.005;

  function handleAdvance() {
    if (!canAdvance) return;
    const cleared = new Set(
      eligibleTransactions.filter((t) => t.cleared).map((t) => t.id),
    );
    setCheckedIds(cleared);
    setOriginallyCleared(cleared);
    setStep("match");
  }

  function handleClose() {
    setStep("initiate");
    setStatementDate("");
    setStatementBalanceStr("");
    setCheckedIds(new Set());
    setOriginallyCleared(new Set());
    onOpenChange(false);
  }

  function toggleChecked(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleFinish() {
    if (!isBalanced) return;
    const toUnclear = [...originallyCleared].filter(
      (id) => !checkedIds.has(id),
    );
    await reconcile.mutateAsync({
      toReconcile: [...checkedIds],
      toUnclear,
      checkpoint: {
        accountId: account.id,
        date: statementDate,
        balance: parsedBalance,
        notes: null,
      },
    });
    handleClose();
  }

  function TxRow({ t }: { t: Transaction }) {
    return (
      <tr key={t.id} className="border-b border-border last:border-0">
        <td className="py-1.5 pr-2">
          <input
            type="checkbox"
            checked={checkedIds.has(t.id)}
            onChange={() => toggleChecked(t.id)}
            className="cursor-pointer"
          />
        </td>
        <td className="py-1.5 pr-3 text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(t.date)}
        </td>
        <td className="py-1.5 pr-3 text-sm max-w-32 truncate">{t.payee}</td>
        <td className="py-1.5 text-sm text-right tabular-nums">
          <Amount value={t.amount} />
        </td>
      </tr>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className={step === "match" ? "sm:max-w-2xl" : "sm:max-w-sm"}
      >
        <DialogHeader>
          <DialogTitle>Reconcile — {account.name}</DialogTitle>
        </DialogHeader>

        {step === "initiate" ? (
          <>
            <div className="flex flex-col gap-4">
              {account.lastReconcileDate && (
                <div className="text-sm text-muted-foreground">
                  Last reconciled:{" "}
                  <span className="font-medium text-foreground">
                    {formatDate(account.lastReconcileDate)} —{" "}
                    {fmt(account.lastReconcileBalance!)}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recon-date">Statement date</Label>
                <Input
                  id="recon-date"
                  type="date"
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recon-balance">Statement ending balance</Label>
                <Input
                  id="recon-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={statementBalanceStr}
                  onChange={(e) => setStatementBalanceStr(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleAdvance} disabled={!canAdvance}>
                Next
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-6 max-h-[50vh] overflow-y-auto">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Payments &amp; Debits
                </p>
                {debits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <table className="w-full">
                    <tbody>
                      {debits.map((t) => (
                        <TxRow key={t.id} t={t} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Deposits &amp; Credits
                </p>
                {credits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <table className="w-full">
                    <tbody>
                      {credits.map((t) => (
                        <TxRow key={t.id} t={t} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening balance</span>
                <span className="tabular-nums">{fmt(openingBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cleared balance</span>
                <span className="tabular-nums">{fmt(clearedBalance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statement balance</span>
                <span className="tabular-nums">{fmt(parsedBalance)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1">
                <span className="font-medium">Difference</span>
                <span
                  className={`font-medium tabular-nums ${
                    isBalanced ? "text-green-600" : "text-destructive"
                  }`}
                >
                  {difference !== null
                    ? isBalanced
                      ? "£0.00 ✓"
                      : fmt(difference)
                    : "—"}
                </span>
              </div>
            </div>

            <DialogFooter className="sm:justify-between">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("initiate")}>
                  Back
                </Button>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
              <Button
                onClick={handleFinish}
                disabled={!isBalanced || reconcile.isPending}
              >
                Finish
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
