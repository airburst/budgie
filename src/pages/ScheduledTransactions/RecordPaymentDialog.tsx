import { CategoryCombobox } from "@/components/CategoryCombobox";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
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
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { computeNextOccurrenceAfter } from "./recurrence/buildRRule";

type RecordPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduledId: number | null;
  onEdit: (id: number) => void;
  focusAmountOnOpen?: boolean;
};

function makeEmpty(date: string) {
  return {
    date,
    accountId: "",
    payee: "",
    categoryId: "",
    withdrawal: "",
    deposit: "",
    notes: "",
  };
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  scheduledId,
  onEdit,
  focusAmountOnOpen = false,
}: RecordPaymentDialogProps) {
  const { scheduled, accounts, remove } = useScheduledTransactions();
  const qc = useQueryClient();

  const sched = scheduledId
    ? scheduled.find((s) => s.id === scheduledId)
    : null;
  const shouldFocusWithdrawal = focusAmountOnOpen && !!sched && sched.amount < 0;
  const shouldFocusDeposit = focusAmountOnOpen && !!sched && sched.amount > 0;

  const [form, setForm] = useState(() =>
    makeEmpty(new Date().toISOString().slice(0, 10)),
  );
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (sched) {
      setForm({
        date: sched.nextDueDate ?? new Date().toISOString().slice(0, 10),
        accountId: String(sched.accountId),
        payee: sched.payee,
        categoryId: sched.categoryId ? String(sched.categoryId) : "",
        withdrawal: sched.amount < 0 ? Math.abs(sched.amount).toFixed(2) : "",
        deposit: sched.amount > 0 ? sched.amount.toFixed(2) : "",
        notes: sched.notes ?? "",
      });
    }
  }, [scheduledId, open]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const recordMutation = useMutation({
    mutationFn: async () => {
      if (!sched) return;
      const amount =
        (parseFloat(form.deposit) || 0) - (parseFloat(form.withdrawal) || 0);
      await window.api.createTransaction({
        accountId: parseInt(form.accountId),
        categoryId: form.categoryId ? parseInt(form.categoryId) : null,
        date: form.date,
        payee: form.payee,
        amount,
        notes: form.notes || null,
        cleared: false,
      });
      const newNextDueDate = sched.nextDueDate
        ? computeNextOccurrenceAfter(sched.rrule, sched.nextDueDate)
        : null;
      await window.api.updateScheduledTransaction(sched.id, {
        nextDueDate: newNextDueDate,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["scheduled_transactions"] });
      onOpenChange(false);
    },
  });

  function handleEdit() {
    if (!sched) return;
    onOpenChange(false);
    onEdit(sched.id);
  }

  function handleDelete() {
    setConfirmDeleteOpen(true);
  }

  const isPending = recordMutation.isPending || remove.isPending;

  if (!sched) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <DatePicker value={form.date} onChange={(v) => set("date", v)} />
            </div>

            {/* Account | Payee */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Account</Label>
                <Select
                  value={form.accountId}
                  onValueChange={(v) => set("accountId", v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select account">
                      {(v: string | null) =>
                        v
                          ? accounts.find((a) => a.id === Number(v))?.name
                          : undefined
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-payee">Payee</Label>
                <Input
                  id="rp-payee"
                  value={form.payee}
                  onChange={(e) => set("payee", e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <CategoryCombobox
                value={form.categoryId}
                onValueChange={(v) => set("categoryId", v)}
              />
            </div>

            {/* Withdrawal | Deposit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-withdrawal">Withdrawal</Label>
                <Input
                  id="rp-withdrawal"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  autoFocus={shouldFocusWithdrawal}
                  value={form.withdrawal}
                  onChange={(e) => {
                    set("withdrawal", e.target.value);
                    if (e.target.value) set("deposit", "");
                  }}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) set("withdrawal", val.toFixed(2));
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rp-deposit">Deposit</Label>
                <Input
                  id="rp-deposit"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  autoFocus={shouldFocusDeposit}
                  value={form.deposit}
                  onChange={(e) => {
                    set("deposit", e.target.value);
                    if (e.target.value) set("withdrawal", "");
                  }}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) set("deposit", val.toFixed(2));
                  }}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rp-notes">Notes</Label>
              <Textarea
                id="rp-notes"
                placeholder="Optional notes..."
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={handleEdit}
                disabled={isPending}
              >
                Edit
              </Button>
              <Button
                onClick={() => recordMutation.mutate()}
                disabled={isPending || !form.accountId || !form.payee}
              >
                Record
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete subscription?"
        description="This will permanently delete this subscription. This action cannot be undone."
        onConfirm={() => {
          remove.mutate(sched.id);
          onOpenChange(false);
        }}
      />
    </>
  );
}
