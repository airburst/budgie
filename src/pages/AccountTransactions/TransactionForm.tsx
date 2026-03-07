import { CategoryCombobox } from "@/components/CategoryCombobox";
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
import { useTransactions } from "@/hooks/useTransactions";
import type { Transaction } from "@/types/electron";
import { useEffect, useState } from "react";

type TransactionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  accountId: number;
};

const empty = {
  date: new Date().toISOString().slice(0, 10),
  payee: "",
  withdrawal: "",
  deposit: "",
  categoryId: "",
  notes: "",
  cleared: false,
};

export function TransactionForm({
  open,
  onOpenChange,
  editingId,
  accountId,
}: TransactionSheetProps) {
  const { transactions, create, update } = useTransactions(accountId);

  const [form, setForm] = useState(empty);

  const editing = editingId
    ? transactions.find((t) => t.id === editingId)
    : null;

  useEffect(() => {
    if (editing) {
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
    } else {
      setForm(empty);
    }
  }, [editingId, open]);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    const amount =
      (parseFloat(form.deposit) || 0) - (parseFloat(form.withdrawal) || 0);
    const data: Omit<Transaction, "id" | "createdAt" | "reconciled"> = {
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
            <Input
              id="tx-payee"
              placeholder="e.g. Starbucks, Amazon..."
              value={form.payee}
              onChange={(e) => set("payee", e.target.value)}
              required
            />
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
              <Label htmlFor="tx-withdrawal">Withdrawal</Label>
              <Input
                id="tx-withdrawal"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.withdrawal}
                onChange={(e) => set("withdrawal", e.target.value)}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) set("withdrawal", val.toFixed(2));
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-deposit">Deposit</Label>
              <Input
                id="tx-deposit"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.deposit}
                onChange={(e) => set("deposit", e.target.value)}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) set("deposit", val.toFixed(2));
                }}
              />
            </div>
          </div>

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
