import { CategoryCombobox } from "@/components/CategoryCombobox";
import { PayeeCombobox } from "@/components/PayeeCombobox";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Textarea } from "@/components/ui/textarea";
import { usePayees } from "@/hooks/usePayees";
import { usePreferences } from "@/hooks/usePreferences";
import { useTransactions } from "@/hooks/useTransactions";
import type { Account, Payee, Transaction } from "@/types/electron";
import { useEffect, useState } from "react";

type FormErrors = { payee?: string; amount?: string };

type TransactionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  accountId: number;
  account?: Account;
  defaultDate?: string;
  defaultCleared?: boolean;
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
}: TransactionSheetProps) {
  const { transactions, create, update } = useTransactions(accountId);
  const { upsert: upsertPayee } = usePayees();
  const { preferences } = usePreferences();

  const isAssumedNegative =
    account?.type === "credit_card" || account?.type === "loan";

  const [form, setForm] = useState(makeEmpty);
  const [errors, setErrors] = useState<FormErrors>({});

  const editing = editingId
    ? transactions.find((t) => t.id === editingId)
    : null;

  useEffect(() => {
    if (editing) {
      if (isAssumedNegative) {
        // For credit cards/loans: negate the display logic
        // negative amount (owed) displays in "deposit", positive (repaid) in "withdrawal"
        setForm({
          date: editing.date,
          payee: editing.payee,
          withdrawal:
            editing.amount > 0 ? Math.abs(editing.amount).toFixed(2) : "",
          deposit:
            editing.amount < 0 ? Math.abs(editing.amount).toFixed(2) : "",
          categoryId: editing.categoryId ? String(editing.categoryId) : "",
          notes: editing.notes ?? "",
          cleared: editing.cleared ?? false,
        });
      } else {
        // Normal logic: negative (withdrawal) and positive (deposit)
        setForm({
          date: editing.date,
          payee: editing.payee,
          withdrawal:
            editing.amount < 0 ? Math.abs(editing.amount).toFixed(2) : "",
          deposit: editing.amount > 0 ? editing.amount.toFixed(2) : "",
          categoryId: editing.categoryId ? String(editing.categoryId) : "",
          notes: editing.notes ?? "",
          cleared: editing.cleared ?? false,
        });
      }
    } else {
      const empty = makeEmpty();
      if (defaultDate) empty.date = defaultDate;
      if (defaultCleared) empty.cleared = true;
      setForm(empty);
    }
    setErrors({});
  }, [editingId, open, isAssumedNegative]);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handlePayeeSelect(payee: Payee) {
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
    if (editing) {
      await update.mutateAsync({ id: editing.id, data });
    } else {
      await create.mutateAsync(data);
    }
    if (form.payee.trim()) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Transaction" : "Add Transaction"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the details of this transaction."
              : "Record a new spending or income entry."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-date">Date</Label>
            <DatePicker value={form.date} onChange={(v) => set("date", v)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-payee">Payee</Label>
            <PayeeCombobox
              key={`${editingId ?? "new"}-${String(open)}`}
              value={form.payee}
              onValueChange={(v) => {
                set("payee", v);
                if (v.trim()) setErrors((e) => ({ ...e, payee: undefined }));
              }}
              onPayeeSelect={handlePayeeSelect}
              autoFocus
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
            <p className="-mt-2 text-sm text-destructive">{errors.amount}</p>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isPending}>
            {editing ? "Save Changes" : "Add Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
