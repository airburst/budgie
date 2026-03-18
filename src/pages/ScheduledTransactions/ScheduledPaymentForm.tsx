import { CategoryCombobox } from "@/components/CategoryCombobox";
import { PayeeCombobox } from "@/components/PayeeCombobox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { usePayees } from "@/hooks/usePayees";
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import type { Payee, ScheduledTransaction } from "@/types/electron";
import { useEffect, useState } from "react";
import { buildRRule, computeNextDueDate } from "./recurrence/buildRRule";
import { parseRRule } from "./recurrence/parseRRule";
import { RecurrenceFields } from "./recurrence/RecurrenceFields";
import type { FrequencyType } from "./recurrence/types";
import { DEFAULT_RECURRENCE_CONFIG } from "./recurrence/types";

type ScheduledPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
};

function makeEmpty() {
  return {
    payee: "",
    withdrawal: "",
    deposit: "",
    categoryId: "",
    accountId: "",
    transferToAccountId: "",
    startDate: new Date().toISOString().slice(0, 10),
    recurrence: DEFAULT_RECURRENCE_CONFIG,
    autoPost: false,
    daysInAdvance: "",
    notes: "",
    active: true,
  };
}

export function ScheduledPaymentDialog({
  open,
  onOpenChange,
  editingId,
}: ScheduledPaymentDialogProps) {
  const { scheduled, accounts, categories, create, update } =
    useScheduledTransactions();
  const { upsert: upsertPayee } = usePayees();

  const [form, setForm] = useState(makeEmpty);

  const editing = editingId ? scheduled.find((s) => s.id === editingId) : null;

  useEffect(() => {
    if (editing) {
      setForm({
        payee: editing.payee,
        withdrawal:
          editing.amount < 0 ? Math.abs(editing.amount).toFixed(2) : "",
        deposit: editing.amount > 0 ? editing.amount.toFixed(2) : "",
        categoryId: editing.categoryId ? String(editing.categoryId) : "",
        accountId: String(editing.accountId),
        transferToAccountId: editing.transferToAccountId
          ? String(editing.transferToAccountId)
          : "",
        startDate: editing.nextDueDate ?? new Date().toISOString().slice(0, 10),
        recurrence: parseRRule(editing.rrule),
        autoPost: editing.autoPost ?? false,
        daysInAdvance:
          editing.daysInAdvance != null ? String(editing.daysInAdvance) : "",
        notes: editing.notes ?? "",
        active: editing.active ?? true,
      });
    } else {
      setForm(makeEmpty());
    }
  }, [editingId, open]);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleFrequencyChange(freq: FrequencyType) {
    setForm((f) => ({
      ...f,
      recurrence: {
        ...f.recurrence,
        frequency: freq,
        occurrence: "Every",
        interval: 1,
        selectedDays: [],
        monthDays: [],
      },
    }));
  }

  function handlePayeeSelect(payee: Payee) {
    if (payee.categoryId) {
      set("categoryId", String(payee.categoryId));
    }
    if (payee.amount !== null && payee.amount !== undefined) {
      if (payee.amount < 0) {
        set("withdrawal", Math.abs(payee.amount).toFixed(2));
        set("deposit", "");
      } else if (payee.amount > 0) {
        set("deposit", payee.amount.toFixed(2));
        set("withdrawal", "");
      }
    }
  }

  function isValid() {
    return (
      form.payee.trim() !== "" &&
      form.accountId !== "" &&
      (parseFloat(form.withdrawal) > 0 || parseFloat(form.deposit) > 0)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid()) return;
    const rruleStr = buildRRule(form.recurrence);
    const nextDueDate = computeNextDueDate(rruleStr, form.startDate);
    const amount =
      (parseFloat(form.deposit as string) || 0) -
      (parseFloat(form.withdrawal as string) || 0);

    const selectedCategory = form.categoryId
      ? categories.find((c) => c.id === parseInt(form.categoryId))
      : null;
    const isTransfer = selectedCategory?.expenseType === "transfer";

    const data: Omit<ScheduledTransaction, "id" | "createdAt"> = {
      payee: form.payee,
      amount,
      accountId: parseInt(form.accountId),
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      transferToAccountId:
        isTransfer && form.transferToAccountId
          ? parseInt(form.transferToAccountId)
          : null,
      rrule: rruleStr,
      nextDueDate,
      autoPost: form.autoPost,
      daysInAdvance:
        form.autoPost && form.daysInAdvance !== ""
          ? parseInt(form.daysInAdvance as string)
          : null,
      notes: form.notes || null,
      active: form.active,
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

  const isPending = create.isPending || update.isPending;
  const isTransferCategory =
    form.categoryId
      ? categories.find((c) => c.id === parseInt(form.categoryId))
          ?.expenseType === "transfer"
      : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Scheduled Payment" : "Add Scheduled Payment"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="-mx-4 max-h-[70vh] overflow-y-auto px-6 flex flex-col gap-4">
            {/* Row 1: Account | Payee */}
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
                <Label htmlFor="sp-payee">Payee</Label>
                <PayeeCombobox
                  key={`${editingId ?? "new"}-${String(open)}`}
                  value={form.payee}
                  onValueChange={(v) => set("payee", v)}
                  onPayeeSelect={handlePayeeSelect}
                />
              </div>
            </div>

            {/* Row 2: Category */}
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <CategoryCombobox
                value={form.categoryId}
                onValueChange={(v) => {
                  set("categoryId", v);
                  // Clear transfer destination if no longer a transfer category
                  const cat = v
                    ? categories.find((c) => c.id === parseInt(v))
                    : null;
                  if (cat?.expenseType !== "transfer") {
                    set("transferToAccountId", "");
                  }
                }}
              />
            </div>

            {/* Transfer destination — only visible for transfer categories */}
            {isTransferCategory && (
              <div className="flex flex-col gap-1.5">
                <Label>Transfer to account</Label>
                <Select
                  value={form.transferToAccountId}
                  onValueChange={(v) => set("transferToAccountId", v ?? "")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select destination account">
                      {(v: string | null) =>
                        v
                          ? accounts.find((a) => a.id === Number(v))?.name
                          : undefined
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => String(a.id) !== form.accountId)
                      .map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Row 3: Withdrawal | Deposit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sp-withdrawal">Withdrawal</Label>
                <Input
                  id="sp-withdrawal"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
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
                <Label htmlFor="sp-deposit">Deposit</Label>
                <Input
                  id="sp-deposit"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
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

            <RecurrenceFields
              startDate={form.startDate}
              recurrence={form.recurrence}
              onStartDateChange={(v) => set("startDate", v)}
              onFrequencyChange={handleFrequencyChange}
              onRecurrenceChange={(recurrence) =>
                setForm((f) => ({ ...f, recurrence }))
              }
            />

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-start gap-3">
              <input
                id="sp-autopost"
                type="checkbox"
                className="mt-0.5 rounded border-input"
                checked={form.autoPost}
                onChange={(e) => set("autoPost", e.target.checked)}
              />
              <div className="flex-1">
                <Label htmlFor="sp-autopost" className="font-medium">
                  Auto-post payment
                </Label>
                {form.autoPost && (
                  <div className="mt-2 flex items-center gap-2">
                    <Label
                      htmlFor="sp-days-advance"
                      className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                      Days in advance
                    </Label>
                    <Input
                      id="sp-days-advance"
                      type="number"
                      min="0"
                      placeholder="0"
                      className="w-24"
                      value={form.daysInAdvance}
                      onChange={(e) => set("daysInAdvance", e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sp-notes">Notes</Label>
              <Textarea
                id="sp-notes"
                placeholder="Optional notes..."
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
              />
            </div>
          </div>
          {/* Hidden submit button so pressing Enter in any input triggers onSubmit */}
          <button
            aria-label="save scheduled payment"
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
          <Button
            onClick={handleSubmit as never}
            disabled={isPending || !isValid()}
          >
            {editing ? "Save Schedule" : "Add Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
