import { CategoryCombobox } from "@/components/CategoryCombobox";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import { formatDate } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { advanceScheduledTransaction, nextDueDateAfter } from "./schedule-advance";

type RecordPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduledId: number | null;
};

/**
 * `confirm` is the read-only review (phones start here); `form` is explicit
 * amount/detail editing (desktop opens here, as before).
 */
type Mode = "confirm" | "form";

type FormState = ReturnType<typeof makeEmpty>;

type FormErrors = { account?: string; payee?: string };

function makeEmpty(date: string = new Date().toISOString().slice(0, 10)) {
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

function sameForm(a: FormState, b: FormState) {
  return (Object.keys(a) as (keyof FormState)[]).every((k) => a[k] === b[k]);
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  scheduledId,
}: RecordPaymentDialogProps) {
  const { scheduled, accounts, categories } = useScheduledTransactions();
  const qc = useQueryClient();
  // Phones start in the read-only confirmation and never autofocus a field.
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const sched = scheduledId
    ? scheduled.find((s) => s.id === scheduledId)
    : null;

  const [form, setForm] = useState(() => makeEmpty());
  const [baseline, setBaseline] = useState(() => makeEmpty());
  const [errors, setErrors] = useState<FormErrors>({});
  const [mode, setMode] = useState<Mode>("form");
  const [actionError, setActionError] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<Mode | "close" | null>(
    null,
  );
  const submittingRef = useRef(false);
  const startedInConfirmRef = useRef(false);

  const dirty = mode === "form" && !sameForm(form, baseline);

  useEffect(() => {
    // Leave content untouched while the surface animates closed.
    if (!open) return;
    if (sched) {
      const next: FormState = {
        date: new Date().toISOString().slice(0, 10),
        accountId: String(sched.accountId),
        payee: sched.payee,
        categoryId: sched.categoryId ? String(sched.categoryId) : "",
        withdrawal: sched.amount < 0 ? Math.abs(sched.amount).toFixed(2) : "",
        deposit: sched.amount > 0 ? sched.amount.toFixed(2) : "",
        notes: sched.notes ?? "",
      };
      setForm(next);
      setBaseline(next);
    }
    setErrors({});
    setActionError(null);
    setDiscardTarget(null);
    startedInConfirmRef.current = compact;
    setMode(compact ? "confirm" : "form");
  }, [scheduledId, open]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function advanceSchedule() {
    if (!sched) return;
    await advanceScheduledTransaction(sched);
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
      await advanceSchedule();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["scheduled_transactions"] });
    },
  });

  const skipMutation = useMutation({
    mutationFn: advanceSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled_transactions"] });
    },
  });

  // One in-flight action at a time: a ref guards a double tap before
  // isPending re-renders. Failures keep the surface open with an alert.
  async function run(action: () => Promise<unknown>, failure: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(
        `${failure} ${err instanceof Error ? err.message : "Please try again."}`,
      );
      return;
    } finally {
      submittingRef.current = false;
    }
    onOpenChange(false);
  }

  function handleRecord() {
    const e: FormErrors = {};
    if (!form.accountId) e.account = "Choose an account.";
    if (!form.payee.trim()) e.payee = "Payee is required.";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      // Surface the problem even from the read-only confirmation.
      setMode("form");
      return;
    }
    void run(
      () => recordMutation.mutateAsync(),
      "Couldn't record the payment.",
    );
  }

  function handleSkip() {
    void run(() => skipMutation.mutateAsync(), "Couldn't skip this payment.");
  }

  const isPending = recordMutation.isPending || skipMutation.isPending;

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
    setForm(baseline);
    setErrors({});
    setActionError(null);
    setMode(target);
  }

  // Implicit dismissal (swipe, Escape, backdrop, close icon) never silently
  // discards a draft and is ignored while an action is in flight.
  function handleOverlayOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (isPending || submittingRef.current) return;
    requestLeave("close");
  }

  if (!sched) return null;

  const account = accounts.find((a) => a.id === Number(form.accountId));
  const category = categories.find((c) => c.id === Number(form.categoryId));
  const amount =
    (parseFloat(form.deposit) || 0) - (parseFloat(form.withdrawal) || 0);
  const isLastOccurrence = nextDueDateAfter(sched) === null;

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOverlayOpenChange}>
      <ResponsiveOverlayContent
        size={mode === "form" ? "expanded" : "auto"}
        dialogClassName="sm:max-w-lg"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            Record Payment
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            {mode === "confirm"
              ? "Nothing is recorded until you confirm."
              : "Adjust the details, then record the payment."}
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        {mode === "confirm" ? (
          <>
            <ResponsiveOverlayBody>
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-lg font-semibold break-words">
                    {form.payee}
                  </p>
                  <p className="shrink-0 text-lg font-semibold tabular-nums">
                    <Amount value={amount} />
                  </p>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Date</dt>
                  <dd>{formatDate(form.date)}</dd>
                  <dt className="text-muted-foreground">Account</dt>
                  <dd>{account?.name ?? "—"}</dd>
                  <dt className="text-muted-foreground">Category</dt>
                  <dd>{category?.name ?? "Uncategorised"}</dd>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="break-words whitespace-pre-wrap">
                    {form.notes.trim() ? (
                      form.notes
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </dd>
                </dl>
                <p className="text-sm text-muted-foreground">
                  Skip moves this schedule to its next date without recording
                  anything.
                  {isLastOccurrence &&
                    " This is the last occurrence, so recording or skipping it removes the schedule."}
                </p>
                {actionError && (
                  <p role="alert" className="text-sm text-destructive">
                    {actionError}
                  </p>
                )}
              </div>
            </ResponsiveOverlayBody>
            <ResponsiveOverlayFooter className="grid-flow-row grid-cols-2">
              <Button
                variant="outline"
                className="order-last col-span-2"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={handleSkip}
              >
                Skip
              </Button>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() => setMode("form")}
              >
                Change amount
              </Button>
              <Button
                className="order-first col-span-2"
                disabled={isPending}
                onClick={handleRecord}
              >
                {recordMutation.isPending ? "Recording…" : "Record payment"}
              </Button>
            </ResponsiveOverlayFooter>
          </>
        ) : (
          <>
            <ResponsiveOverlayBody>
              <div className="flex flex-col gap-4">
                {/* Date */}
                <div className="flex flex-col gap-1.5">
                  <Label>Date</Label>
                  <DatePicker
                    value={form.date}
                    onChange={(v) => set("date", v)}
                  />
                </div>

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
                    <Label htmlFor="rp-payee">Payee</Label>
                    <Input
                      id="rp-payee"
                      value={form.payee}
                      onChange={(e) => {
                        set("payee", e.target.value);
                        if (e.target.value.trim())
                          setErrors((err) => ({ ...err, payee: undefined }));
                      }}
                      required
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

                {actionError && (
                  <p role="alert" className="text-sm text-destructive">
                    {actionError}
                  </p>
                )}
              </div>
            </ResponsiveOverlayBody>

            <ResponsiveOverlayFooter>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() =>
                  requestLeave(
                    startedInConfirmRef.current ? "confirm" : "close",
                  )
                }
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={handleSkip}
              >
                Skip
              </Button>
              <Button disabled={isPending} onClick={handleRecord}>
                {recordMutation.isPending ? "Recording…" : "Record"}
              </Button>
            </ResponsiveOverlayFooter>
          </>
        )}

        <ConfirmDialog
          open={discardTarget !== null}
          onOpenChange={(o) => !o && setDiscardTarget(null)}
          title="Discard changes?"
          description="Your edits to this payment haven't been recorded."
          confirmLabel="Discard"
          onConfirm={() => discardTarget && leave(discardTarget)}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
