import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccountReconciliations } from "@/hooks/useAccountReconciliations";
import type { AccountWithBalances } from "@/types/electron";
import { useState } from "react";

type ReconciliationDialogProps = {
  account: AccountWithBalances;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReconciliationDialog({
  account,
  open,
  onOpenChange,
}: ReconciliationDialogProps) {
  const { create } = useAccountReconciliations(account.id);
  const [date, setDate] = useState("");
  const [statementBalance, setStatementBalance] = useState("");

  const parsed = parseFloat(statementBalance);
  const hasBalance = statementBalance !== "" && !isNaN(parsed);
  const difference = hasBalance ? parsed - account.clearedBalance : null;
  const isBalanced = difference !== null && Math.abs(difference) < 0.005;
  const canSave = !!date && isBalanced;

  function handleClose() {
    setDate("");
    setStatementBalance("");
    onOpenChange(false);
  }

  async function handleSave() {
    if (!canSave) return;
    await create.mutateAsync({
      accountId: account.id,
      date,
      balance: parsed,
      notes: null,
    });
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reconcile — {account.name}</DialogTitle>
          <DialogDescription>
            Mark transactions as cleared in the register until the cleared
            balance matches your statement, then save the checkpoint.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cleared balance</span>
              <span className="font-medium tabular-nums">
                {account.clearedBalance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            {hasBalance && (
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Difference</span>
                <span
                  className={`font-medium tabular-nums ${isBalanced ? "text-green-600" : "text-destructive"}`}
                >
                  {difference! >= 0 ? "+" : ""}
                  {difference!.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recon-date">Statement date</Label>
            <Input
              id="recon-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recon-balance">Statement closing balance</Label>
            <Input
              id="recon-balance"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || create.isPending}>
            Save Checkpoint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
