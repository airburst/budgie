import { CategoryCombobox } from "@/components/CategoryCombobox";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PayeeCombobox } from "@/components/PayeeCombobox";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePayees } from "@/hooks/usePayees";
import { usePreferences } from "@/hooks/usePreferences";
import { useTransactions } from "@/hooks/useTransactions";
import type { Account, Payee, Transaction } from "@/types/electron";
import { useEffect, useRef, useState } from "react";
import { TransactionDetails } from "./TransactionDetails";

type FormErrors = { payee?: string; amount?: string };

type FormState = ReturnType<typeof makeEmpty>;

type Mode = "details" | "edit";

function sameForm(a: FormState, b: FormState) {
  return (Object.keys(a) as (keyof FormState)[]).every((k) => a[k] === b[k]);
}

type TransactionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  accountId: number;
  account?: Account;
  defaultDate?: string;
  defaultCleared?: boolean;
  defaultAmount?: number;
  focusAmountOnOpen?: boolean;
  autoBalance?: boolean;
  /**
   * `details` opens an existing transaction read-only first; Edit is then an
   * explicit second step. Reconciled transactions always open in details.
   */
  initialMode?: Mode;
};

function makeEmpty() {
  return {
    date: new Date().toISOString().slice(0, 10),
    payee: "",
    withdrawal: "",
    deposit: "",
    categoryId: "",
    notes: "",
    cleared: false,
  };
}

export function TransactionForm({
  open,
  onOpenChange,
  editingId,
  accountId,
  account,
  defaultDate,
  defaultCleared,
  defaultAmount,
  focusAmountOnOpen = false,
  autoBalance = false,
  initialMode = "edit",
}: TransactionSheetProps) {
  const { transactions, categories, create, update } =
    useTransactions(accountId);
  const { upsert: upsertPayee } = usePayees();
  const { preferences } = usePreferences();
  // Phones never autofocus: opening or entering Edit must not summon the keyboard.
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const isAssumedNegative =
    account?.type === "credit_card" || account?.type === "loan";

  const [form, setForm] = useState(makeEmpty);
  const [baseline, setBaseline] = useState(makeEmpty);
  const [errors, setErrors] = useState<FormErrors>({});
  const [mode, setMode] = useState<Mode>("edit");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<Mode | "close" | null>(
    null,
  );
  const submittingRef = useRef(false);

  const editing = editingId
    ? transactions.find((t) => t.id === editingId)
    : null;
  const startsInDetails =
    !!editing && (initialMode === "details" || editing.reconciled);
  const dirty = mode === "edit" && !sameForm(form, baseline);

  const shouldFocusWithdrawal =
    !compact &&
    focusAmountOnOpen &&
    !!editing &&
    (isAssumedNegative ? editing.amount > 0 : editing.amount < 0);
  const shouldFocusDeposit =
    !compact &&
    focusAmountOnOpen &&
    !!editing &&
    (isAssumedNegative ? editing.amount < 0 : editing.amount > 0);

  function formFromTransaction(tx: Transaction): FormState {
    // Credit cards/loans invert the display: negative (owed) shows as
    // "deposit", positive (repaid) as "withdrawal".
    const outgoing = isAssumedNegative ? tx.amount > 0 : tx.amount < 0;
    const incoming = isAssumedNegative ? tx.amount < 0 : tx.amount > 0;
    return {
      date: tx.date,
      payee: tx.payee,
      withdrawal: outgoing ? Math.abs(tx.amount).toFixed(2) : "",
      deposit: incoming ? Math.abs(tx.amount).toFixed(2) : "",
      categoryId: tx.categoryId ? String(tx.categoryId) : "",
      notes: tx.notes ?? "",
      cleared: tx.cleared ?? false,
    };
  }

  function resetDraft(next: FormState) {
    setForm(next);
    setBaseline(next);
    setErrors({});
    setSaveError(null);
  }

  useEffect(() => {
    // Leave content untouched while the surface animates closed.
    if (!open) return;
    if (editing) {
      resetDraft(formFromTransaction(editing));
    } else {
      const empty = makeEmpty();
      if (defaultDate) empty.date = defaultDate;
      if (defaultCleared) empty.cleared = true;
      if (autoBalance) empty.payee = "Adjustment";
      if (defaultAmount) {
        if (isAssumedNegative ? defaultAmount > 0 : defaultAmount < 0) {
          empty.withdrawal = Math.abs(defaultAmount).toFixed(2);
        } else {
          empty.deposit = Math.abs(defaultAmount).toFixed(2);
        }
      }
      resetDraft(empty);
    }
    setMode(startsInDetails ? "details" : "edit");
    setDiscardTarget(null);
  }, [editingId, open, isAssumedNegative]);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handlePayeeSelect(payee: Payee) {
    if (autoBalance) return;
    if (!preferences.autofillPayees) return;
    if (payee.categoryId) {
      set("categoryId", String(payee.categoryId));
    }
    if (payee.amount !== null && payee.amount !== undefined) {
      if (isAssumedNegative) {
        // For credit cards/loans: negate the display logic
        if (payee.amount > 0) {
          // Payment should go in withdrawal
          set("withdrawal", Math.abs(payee.amount).toFixed(2));
          set("deposit", "");
        } else if (payee.amount < 0) {
          // Amount owed goes in deposit
          set("deposit", Math.abs(payee.amount).toFixed(2));
          set("withdrawal", "");
        }
      } else {
        // Normal logic
        if (payee.amount < 0) {
          set("withdrawal", Math.abs(payee.amount).toFixed(2));
          set("deposit", "");
        } else if (payee.amount > 0) {
          set("deposit", payee.amount.toFixed(2));
          set("withdrawal", "");
        }
      }
    }
  }

  function validate(): boolean {
    const e: FormErrors = {};
    if (!form.payee.trim()) e.payee = "Payee is required.";
    const hasAmount =
      parseFloat(form.withdrawal) > 0 || parseFloat(form.deposit) > 0;
    if (!hasAmount) e.amount = "Enter a withdrawal or deposit amount.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    let amount: number;
    if (isAssumedNegative) {
      // For credit cards/loans: deposit is money owed (negative), withdrawal is payment (positive)
      amount =
        (parseFloat(form.withdrawal) || 0) - (parseFloat(form.deposit) || 0);
    } else {
      // Normal: withdrawal is negative, deposit is positive
      amount =
        (parseFloat(form.deposit) || 0) - (parseFloat(form.withdrawal) || 0);
    }

    const data: Omit<
      Transaction,
      "id" | "createdAt" | "reconciled" | "transferTransactionId"
    > = {
      accountId,
      date: form.date,
      payee: form.payee,
      amount,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      notes: form.notes || null,
      cleared: form.cleared,
    };
    // Guards Enter + click (or a double tap) before isPending re-renders.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaveError(null);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, data });
      } else {
        await create.mutateAsync(data);
      }
    } catch (err) {
      // Keep the surface open with the draft intact so the user can retry.
      setSaveError(
        `Couldn't save the transaction. ${err instanceof Error ? err.message : "Please try again."}`,
      );
      return;
    } finally {
      submittingRef.current = false;
    }
    if (form.payee.trim() && !autoBalance) {
      upsertPayee.mutate({
        name: form.payee.trim(),
        categoryId: data.categoryId ?? null,
        amount: amount !== 0 ? amount : null,
      });
    }
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save();
  }

  const isPending = create.isPending || update.isPending;

  function requestLeave(target: Mode | "close") {
    if (dirty) {
      setDiscardTarget(target);
      return;
    }
    leave(target);
  }

  function leave(target: Mode | "close") {
    setDiscardTarget(null);
    if (target === "close") {
      onOpenChange(false);
      return;
    }
    resetDraft(baseline);
    setMode(target);
  }

  // Implicit dismissal (swipe, Escape, backdrop, close icon) never silently
  // discards a draft and is ignored while a save is in flight.
  function handleOverlayOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (isPending || submittingRef.current) return;
    requestLeave("close");
  }

  const category =
    editing && editing.categoryId != null
      ? categories.find((c) => c.id === editing.categoryId)
      : null;

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOverlayOpenChange}>
      <ResponsiveOverlayContent
        size={mode === "edit" ? "expanded" : "auto"}
        dialogClassName="sm:max-w-md"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            {mode === "details"
              ? "Transaction Details"
              : editing
                ? "Edit Transaction"
                : "Add Transaction"}
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            {mode === "details"
              ? "Review this transaction before making changes."
              : editing
                ? "Update the details of this transaction."
                : "Record a new spending or income entry."}
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        {mode === "details" && editing ? (
          <>
            <ResponsiveOverlayBody>
              <TransactionDetails
                transaction={editing}
                category={category}
                accountName={account?.name}
              />
            </ResponsiveOverlayBody>
            <ResponsiveOverlayFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {!editing.reconciled && (
                <Button onClick={() => setMode("edit")}>Edit</Button>
              )}
            </ResponsiveOverlayFooter>
          </>
        ) : (
          <>
            <ResponsiveOverlayBody>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tx-date">Date</Label>
                  <DatePicker
                    value={form.date}
                    onChange={(v) => set("date", v)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tx-payee">Payee</Label>
                  <PayeeCombobox
                    key={`${editingId ?? "new"}-${String(open)}`}
                    value={form.payee}
                    onValueChange={(v) => {
                      set("payee", v);
                      if (v.trim())
                        setErrors((e) => ({ ...e, payee: undefined }));
                    }}
                    onPayeeSelect={handlePayeeSelect}
                    disabled={autoBalance}
                    autoFocus={
                      !compact &&
                      !autoBalance &&
                      !shouldFocusWithdrawal &&
                      !shouldFocusDeposit
                    }
                  />
                  {errors.payee && (
                    <p className="text-sm text-destructive">{errors.payee}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Category</Label>
                  <CategoryCombobox
                    value={form.categoryId}
                    onValueChange={(v) => set("categoryId", v)}
                    autoFocus={
                      !compact &&
                      autoBalance &&
                      !shouldFocusWithdrawal &&
                      !shouldFocusDeposit
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tx-withdrawal">
                      {isAssumedNegative ? "Payment" : "Withdrawal"}
                    </Label>
                    <Input
                      id="tx-withdrawal"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      autoFocus={shouldFocusWithdrawal}
                      value={form.withdrawal}
                      onChange={(e) => {
                        set("withdrawal", e.target.value);
                        if (e.target.value) set("deposit", "");
                        if (parseFloat(e.target.value) > 0)
                          setErrors((err) => ({ ...err, amount: undefined }));
                      }}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) set("withdrawal", val.toFixed(2));
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tx-deposit">
                      {isAssumedNegative ? "Amount Borrowed" : "Deposit"}
                    </Label>
                    <Input
                      id="tx-deposit"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      autoFocus={shouldFocusDeposit}
                      value={form.deposit}
                      onChange={(e) => {
                        set("deposit", e.target.value);
                        if (e.target.value) set("withdrawal", "");
                        if (parseFloat(e.target.value) > 0)
                          setErrors((err) => ({ ...err, amount: undefined }));
                      }}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) set("deposit", val.toFixed(2));
                      }}
                    />
                  </div>
                </div>
                {errors.amount && (
                  <p className="-mt-2 text-sm text-destructive">
                    {errors.amount}
                  </p>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tx-notes">Notes</Label>
                  <Textarea
                    id="tx-notes"
                    placeholder="Optional notes..."
                    value={form.notes}
                    onChange={(e) => set("notes", e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="tx-cleared"
                    type="checkbox"
                    className="rounded border-input"
                    checked={form.cleared}
                    onChange={(e) => set("cleared", e.target.checked)}
                  />
                  <Label htmlFor="tx-cleared">Cleared</Label>
                </div>
                {/* Hidden submit button so pressing Enter in any input triggers onSubmit */}
                <button
                  aria-label="save transaction"
                  type="submit"
                  className="sr-only"
                  aria-hidden
                  tabIndex={-1}
                />
              </form>
              {saveError && (
                <p role="alert" className="mt-4 text-sm text-destructive">
                  {saveError}
                </p>
              )}
            </ResponsiveOverlayBody>

            <ResponsiveOverlayFooter>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  requestLeave(startsInDetails && editing ? "details" : "close")
                }
              >
                Cancel
              </Button>
              <Button onClick={save} disabled={isPending}>
                {isPending
                  ? "Saving…"
                  : editing
                    ? "Save Changes"
                    : "Add Transaction"}
              </Button>
            </ResponsiveOverlayFooter>
          </>
        )}

        <ConfirmDialog
          open={discardTarget !== null}
          onOpenChange={(o) => !o && setDiscardTarget(null)}
          title="Discard changes?"
          description="Your edits to this transaction haven't been saved."
          confirmLabel="Discard"
          onConfirm={() => discardTarget && leave(discardTarget)}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
