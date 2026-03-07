import { CategoryCombobox } from "@/components/CategoryCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import type { ScheduledTransaction } from "@/types/electron";
import { useEffect, useState } from "react";
import { RRule } from "rrule";

type ScheduledPaymentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
};

type EndCondition = "never" | "on_date" | "after_x";

const FREQ_MAP: Record<string, string> = {
  Daily: "FREQ=DAILY",
  Weekly: "FREQ=WEEKLY",
  Monthly: "FREQ=MONTHLY",
  Yearly: "FREQ=YEARLY",
};

const FREQ_NUM_TO_LABEL: Record<number, string> = {
  [RRule.DAILY]: "Daily",
  [RRule.WEEKLY]: "Weekly",
  [RRule.MONTHLY]: "Monthly",
  [RRule.YEARLY]: "Yearly",
};

const empty = {
  payee: "",
  amount: "",
  categoryId: "",
  accountId: "",
  startDate: new Date().toISOString().slice(0, 10),
  frequency: "Monthly",
  endCondition: "never" as EndCondition,
  endDate: "",
  endCount: "",
  autoPost: false,
  notes: "",
  active: true,
};

function buildRRule(
  startDate: string,
  frequency: string,
  endCondition: EndCondition,
  endDate: string,
  endCount: string,
): string {
  const base = FREQ_MAP[frequency] ?? "FREQ=MONTHLY";
  let rrule = base;
  if (endCondition === "on_date" && endDate) {
    const until = endDate.replace(/-/g, "");
    rrule += `;UNTIL=${until}T000000Z`;
  } else if (endCondition === "after_x" && endCount) {
    rrule += `;COUNT=${endCount}`;
  }
  return rrule;
}

function computeNextDueDate(rruleStr: string): string | null {
  try {
    const rule = RRule.fromString(rruleStr);
    const next = rule.after(new Date(), true);
    return next ? next.toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
}

export function ScheduledPaymentSheet({
  open,
  onOpenChange,
  editingId,
}: ScheduledPaymentSheetProps) {
  const { scheduled, accounts, create, update } = useScheduledTransactions();

  const [form, setForm] = useState(empty);

  const editing = editingId ? scheduled.find((s) => s.id === editingId) : null;

  useEffect(() => {
    if (editing) {
      let frequency = "Monthly";
      let endCondition: EndCondition = "never";
      let endDate = "";
      let endCount = "";
      try {
        const rule = RRule.fromString(editing.rrule);
        frequency = FREQ_NUM_TO_LABEL[rule.options.freq] ?? "Monthly";
        if (rule.options.until) {
          endCondition = "on_date";
          endDate = rule.options.until.toISOString().slice(0, 10);
        } else if (rule.options.count) {
          endCondition = "after_x";
          endCount = String(rule.options.count);
        }
      } catch {
        // keep defaults
      }
      setForm({
        payee: editing.payee,
        amount: String(editing.amount),
        categoryId: editing.categoryId ? String(editing.categoryId) : "",
        accountId: String(editing.accountId),
        startDate: editing.nextDueDate ?? new Date().toISOString().slice(0, 10),
        frequency,
        endCondition,
        endDate,
        endCount,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rruleStr = buildRRule(
      form.startDate,
      form.frequency,
      form.endCondition,
      form.endDate,
      form.endCount,
    );
    const nextDueDate = computeNextDueDate(rruleStr);

    const data: Omit<ScheduledTransaction, "id" | "createdAt"> = {
      payee: form.payee,
      amount: parseFloat(form.amount as string) || 0,
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {editing ? "Edit Scheduled Payment" : "Add Scheduled Payment"}
          </SheetTitle>
          <SheetDescription>
            Configure a recurring bill or transfer.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4">
          <div className="grid grid-cols-2 gap-3">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sp-amount">Amount</Label>
              <Input
                id="sp-amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <CategoryCombobox
                value={form.categoryId}
                onValueChange={(v) => set("categoryId", v)}
              />
            </div>
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
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Recurrence Rules
            </p>
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
                  value={form.frequency}
                  onValueChange={(v) => set("frequency", v ?? "Monthly")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Daily", "Weekly", "Monthly", "Yearly"].map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>End Condition</Label>
            <div className="flex gap-2">
              {(
                [
                  ["never", "Never"],
                  ["on_date", "On date"],
                  ["after_x", "After X times"],
                ] as [EndCondition, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => set("endCondition", val)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    form.endCondition === val
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {form.endCondition === "on_date" && (
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
            )}
            {form.endCondition === "after_x" && (
              <Input
                type="number"
                min="1"
                placeholder="Number of payments"
                value={form.endCount}
                onChange={(e) => set("endCount", e.target.value)}
              />
            )}
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
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically record this payment on the scheduled date.
              </p>
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
        </form>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit as never}
            disabled={isPending || !form.accountId}
          >
            {editing ? "Save Schedule" : "Add Schedule"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
