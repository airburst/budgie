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
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePayees } from "@/hooks/usePayees";
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import type { Payee, ScheduledTransaction } from "@/types/electron";
import { useEffect, useRef, useState } from "react";
import { buildRRule, computeNextDueDate } from "./recurrence/buildRRule";
import { parseRRule } from "./recurrence/parseRRule";
import { RecurrenceFields } from "./recurrence/RecurrenceFields";
import type { FrequencyType } from "./recurrence/types";
import { DEFAULT_RECURRENCE_CONFIG } from "./recurrence/types";
import { ScheduledDetails } from "./ScheduledDetails";

type Mode = "details" | "edit";

type FormErrors = { payee?: string; account?: string; amount?: string };

type FormState = ReturnType<typeof makeEmpty>;

type ScheduledPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  /**
   * `details` opens an existing schedule read-only first; Edit and Record
   * payment are then explicit second steps.
   */
  initialMode?: Mode;
  /** Explicit Record payment action from the details view. */
  onRecord?: (id: number) => void;
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

function sameForm(a: FormState, b: FormState) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function ScheduledPaymentDialog({
  open,
  onOpenChange,
  editingId,
  initialMode = "edit",
  onRecord,
}: ScheduledPaymentDialogProps) {
  const { scheduled, accounts, categories, create, update } =
    useScheduledTransactions();
  const { upsert: upsertPayee } = usePayees();
  // Phones never autofocus: opening or entering Edit must not summon the keyboard.
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const [form, setForm] = useState(makeEmpty);
  const [baseline, setBaseline] = useState(makeEmpty);
  const [errors, setErrors] = useState<FormErrors>({});
  const [mode, setMode] = useState<Mode>("edit");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<Mode | "close" | null>(
    null,
  );
  const submittingRef = useRef(false);

  const editing = editingId ? scheduled.find((s) => s.id === editingId) : null;
  const startsInDetails = !!editing && initialMode === "details";
  const dirty = mode === "edit" && !sameForm(form, baseline);

  function formFromSchedule(s: ScheduledTransaction): FormState {
    return {
      payee: s.payee,
      withdrawal: s.amount < 0 ? Math.abs(s.amount).toFixed(2) : "",
      deposit: s.amount > 0 ? s.amount.toFixed(2) : "",
      categoryId: s.categoryId ? String(s.categoryId) : "",
      accountId: String(s.accountId),
      transferToAccountId: s.transferToAccountId
        ? String(s.transferToAccountId)
        : "",
      startDate: s.nextDueDate ?? new Date().toISOString().slice(0, 10),
      recurrence: parseRRule(s.rrule),
      autoPost: s.autoPost ?? false,
      daysInAdvance: s.daysInAdvance != null ? String(s.daysInAdvance) : "",
      notes: s.notes ?? "",
      active: s.active ?? true,
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
    resetDraft(editing ? formFromSchedule(editing) : makeEmpty());
    setMode(startsInDetails ? "details" : "edit");
    setDiscardTarget(null);
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

  function validate(): boolean {
    const e: FormErrors = {};
    if (!form.payee.trim()) e.payee = "Payee is required.";
    if (form.accountId === "") e.account = "Choose an account.";
    if (!(parseFloat(form.withdrawal) > 0 || parseFloat(form.deposit) > 0)) {
      e.amount = "Enter a withdrawal or deposit amount.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
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
        `Couldn't save the schedule. ${err instanceof Error ? err.message : "Please try again."}`,
      );
      return;
    } finally {
      submittingRef.current = false;
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

  const isTransferCategory = form.categoryId
    ? categories.find((c) => c.id === parseInt(form.categoryId))
        ?.expenseType === "transfer"
    : false;
  const category =
    editing && editing.categoryId != null
      ? categories.find((c) => c.id === editing.categoryId)
      : null;

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOverlayOpenChange}>
      <ResponsiveOverlayContent
        size={mode === "edit" ? "expanded" : "auto"}
        dialogClassName="sm:max-w-2xl"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            {mode === "details"
              ? "Scheduled Payment Details"
              : editing
                ? "Edit Scheduled Payment"
                : "Add Scheduled Payment"}
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            {mode === "details"
              ? "Review this schedule. Nothing is recorded from here."
              : editing
                ? "Update this schedule and its recurrence."
                : "Set up a recurring payment or income."}
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        {mode === "details" && editing ? (
          <>
            <ResponsiveOverlayBody>
              <ScheduledDetails
                scheduled={editing}
                accounts={accounts}
                category={category}
              />
            </ResponsiveOverlayBody>
            <ResponsiveOverlayFooter className="grid-flow-row grid-cols-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button variant="outline" onClick={() => setMode("edit")}>
                Edit
              </Button>
              {onRecord && (
                <Button
                  className="order-first col-span-2 md:order-none md:col-span-1"
                  onClick={() => onRecord(editing.id)}
                >
                  Record payment
                </Button>
              )}
            </ResponsiveOverlayFooter>
          </>
        ) : (
          <>
            <ResponsiveOverlayBody className="md:-mx-4 md:max-h-[70vh] md:overflow-y-auto md:px-6">
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Account | Payee */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label>Account</Label>
                    <Select
                      value={form.accountId}
                      onValueChange={(v) => {
                        set("accountId", v ?? "");
                        if (v) setErrors((e) => ({ ...e, account: undefined }));
                      }}
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
                    {errors.account && (
                      <p className="text-sm text-destructive">
                        {errors.account}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sp-payee">Payee</Label>
                    <PayeeCombobox
                      key={`${editingId ?? "new"}-${String(open)}`}
                      value={form.payee}
                      onValueChange={(v) => {
                        set("payee", v);
                        if (v.trim())
                          setErrors((e) => ({ ...e, payee: undefined }));
                      }}
                      onPayeeSelect={handlePayeeSelect}
                    />
                    {errors.payee && (
                      <p className="text-sm text-destructive">{errors.payee}</p>
                    )}
                  </div>
                </div>

                {/* Category */}
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

                {/* Withdrawal | Deposit */}
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

                <RecurrenceFields
                  startDate={form.startDate}
                  recurrence={form.recurrence}
                  onStartDateChange={(v) => set("startDate", v)}
                  onFrequencyChange={handleFrequencyChange}
                  onRecurrenceChange={(recurrence) =>
                    setForm((f) => ({ ...f, recurrence }))
                  }
                />

                <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <input
                    id="sp-autopost"
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-input"
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
                          className="text-sm whitespace-nowrap text-muted-foreground"
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
                {/* Hidden submit button so pressing Enter in any input triggers onSubmit */}
                <button
                  aria-label="save scheduled payment"
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
                    ? "Save Schedule"
                    : "Add Schedule"}
              </Button>
            </ResponsiveOverlayFooter>
          </>
        )}

        <ConfirmDialog
          open={discardTarget !== null}
          onOpenChange={(o) => !o && setDiscardTarget(null)}
          title="Discard changes?"
          description="Your edits to this schedule haven't been saved."
          confirmLabel="Discard"
          onConfirm={() => discardTarget && leave(discardTarget)}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
