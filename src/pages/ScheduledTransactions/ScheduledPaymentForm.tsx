import { CategoryCombobox } from "@/components/CategoryCombobox";
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
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import type { ScheduledTransaction } from "@/types/electron";
import { useEffect, useState } from "react";
import { buildRRule, computeNextDueDate } from "./recurrence/buildRRule";
import { parseRRule } from "./recurrence/parseRRule";
import { RecurrenceSection } from "./recurrence/RecurrenceSection";
import type { FrequencyType, RecurrenceConfig } from "./recurrence/types";
import {
  DEFAULT_RECURRENCE_CONFIG,
  FREQUENCY_OPTIONS,
} from "./recurrence/types";

type ScheduledPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
};

const empty = {
  payee: "",
  withdrawal: "",
  deposit: "",
  categoryId: "",
  accountId: "",
  startDate: new Date().toISOString().slice(0, 10),
  recurrence: DEFAULT_RECURRENCE_CONFIG,
  autoPost: false,
  notes: "",
  active: true,
};

export function ScheduledPaymentDialog({
  open,
  onOpenChange,
  editingId,
}: ScheduledPaymentDialogProps) {
  const { scheduled, accounts, create, update } = useScheduledTransactions();

  const [form, setForm] = useState(empty);

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
        startDate: editing.nextDueDate ?? new Date().toISOString().slice(0, 10),
        recurrence: parseRRule(editing.rrule),
        autoPost: editing.autoPost ?? false,
        notes: editing.notes ?? "",
        active: editing.active ?? true,
      });
    } else {
      setForm(empty);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rruleStr = buildRRule(form.recurrence);
    const nextDueDate = computeNextDueDate(rruleStr);
    const amount =
      (parseFloat(form.deposit as string) || 0) -
      (parseFloat(form.withdrawal as string) || 0);

    const data: Omit<ScheduledTransaction, "id" | "createdAt"> = {
      payee: form.payee,
      amount,
      accountId: parseInt(form.accountId),
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      rrule: rruleStr,
      nextDueDate,
      autoPost: form.autoPost,
      notes: form.notes || null,
      active: form.active,
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
                <Input
                  id="sp-payee"
                  placeholder="e.g. Netflix, Rent..."
                  value={form.payee}
                  onChange={(e) => set("payee", e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Row 2: Category */}
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <CategoryCombobox
                value={form.categoryId}
                onValueChange={(v) => set("categoryId", v)}
              />
            </div>

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
                  onChange={(e) => set("withdrawal", e.target.value)}
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
                  onChange={(e) => set("deposit", e.target.value)}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) set("deposit", val.toFixed(2));
                  }}
                />
              </div>
            </div>

            {/* Recurrence section */}
            <div className="border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Recurrence Rules
              </p>
              <div className="flex flex-col gap-3">
                {/* First Payment Date | Frequency on same row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sp-start">First Payment Date</Label>
                    <Input
                      id="sp-start"
                      type="date"
                      value={form.startDate}
                      onChange={(e) => set("startDate", e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Frequency</Label>
                    <Select
                      value={form.recurrence.frequency}
                      onValueChange={(v) =>
                        handleFrequencyChange(v as FrequencyType)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <RecurrenceSection
                  config={form.recurrence}
                  onChange={(recurrence: RecurrenceConfig) =>
                    setForm((f) => ({ ...f, recurrence }))
                  }
                />
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-start gap-3">
              <input
                id="sp-autopost"
                type="checkbox"
                className="mt-0.5 rounded border-input"
                checked={form.autoPost}
                onChange={(e) => set("autoPost", e.target.checked)}
              />
              <div>
                <Label htmlFor="sp-autopost" className="font-medium">
                  Auto-post payment
                </Label>
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
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit as never}
            disabled={isPending || !form.accountId}
          >
            {editing ? "Save Schedule" : "Add Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
