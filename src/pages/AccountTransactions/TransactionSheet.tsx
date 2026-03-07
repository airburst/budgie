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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  amount: "",
  categoryId: "",
  notes: "",
  cleared: false,
};

export function TransactionSheet({
  open,
  onOpenChange,
  editingId,
  accountId,
}: TransactionSheetProps) {
  const { transactions, categories, create, update } =
    useTransactions(accountId);

  const [form, setForm] = useState(empty);

  const editing = editingId
    ? transactions.find((t) => t.id === editingId)
    : null;

  useEffect(() => {
    if (editing) {
      setForm({
        date: editing.date,
        payee: editing.payee,
        amount: String(editing.amount),
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Omit<Transaction, "id" | "createdAt"> = {
      accountId,
      date: form.date,
      payee: form.payee,
      amount: parseFloat(form.amount as string) || 0,
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-amount">Amount</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                required
              />
            </div>
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
            <Select
              value={form.categoryId}
              onValueChange={(v) => set("categoryId", v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button onClick={handleSubmit as never} disabled={isPending}>
            {editing ? "Save Changes" : "Add Transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
