import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/useIsMobile";
import { formatDate } from "@/lib/utils";
import type { AccountWithBalances } from "@/types/electron";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

type ReconciliationDialogProps = {
  account: AccountWithBalances;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function fmt(n: number) {
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

export function ReconciliationDialog({
  account,
  open,
  onOpenChange,
}: ReconciliationDialogProps) {
  const navigate = useNavigate();
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const hasPendingSession =
    account.pendingReconcileBalance !== null &&
    account.pendingReconcileBalance !== undefined;

  const [statementDate, setStatementDate] = useState(
    () => account.pendingReconcileDate ?? new Date().toISOString().slice(0, 10),
  );
  const [statementBalanceStr, setStatementBalanceStr] = useState(
    () => account.pendingReconcileBalance?.toString() ?? "",
  );

  useEffect(() => {
    if (open) {
      setStatementDate(
        account.pendingReconcileDate ?? new Date().toISOString().slice(0, 10),
      );
      setStatementBalanceStr(account.pendingReconcileBalance?.toString() ?? "");
    }
  }, [
    open,
    account.id,
    account.pendingReconcileDate,
    account.pendingReconcileBalance,
  ]);

  const parsedBalance = parseFloat(statementBalanceStr);
  const hasValidBalance = statementBalanceStr !== "" && !isNaN(parsedBalance);
  const canAdvance = !!statementDate && hasValidBalance;

  function handleClose() {
    setStatementDate(
      account.pendingReconcileDate ?? new Date().toISOString().slice(0, 10),
    );
    setStatementBalanceStr(account.pendingReconcileBalance?.toString() ?? "");
    onOpenChange(false);
  }

  async function handleNext() {
    if (!canAdvance) return;
    await window.api.updateAccount(account.id, {
      pendingReconcileBalance: parsedBalance,
      pendingReconcileDate: statementDate,
    });
    onOpenChange(false);
    navigate(
      `/reconcile/${account.id}?date=${statementDate}&balance=${parsedBalance}`,
    );
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={(o) => !o && handleClose()}>
      <ResponsiveOverlayContent
        dialogClassName="sm:max-w-sm"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            Reconcile — {account.name}
          </ResponsiveOverlayTitle>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody>
          <form
            id="reconcile-setup"
            onSubmit={(e) => {
              e.preventDefault();
              handleNext();
            }}
          >
            <div className="flex flex-col gap-4">
              {hasPendingSession && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                  Continuing a previous session. Update the values below if
                  needed.
                </div>
              )}
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
                <Label>Statement date</Label>
                <DatePicker
                  value={statementDate}
                  onChange={setStatementDate}
                  placeholder="Pick statement date"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recon-balance">Statement ending balance</Label>
                <Input
                  id="recon-balance"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="0.00"
                  value={statementBalanceStr}
                  onChange={(e) => setStatementBalanceStr(e.target.value)}
                  autoFocus={!compact && !hasPendingSession}
                />
              </div>
            </div>
          </form>
        </ResponsiveOverlayBody>
        <ResponsiveOverlayFooter className="md:mt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" form="reconcile-setup" disabled={!canAdvance}>
            Next
          </Button>
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
