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
import { useAccounts } from "@/hooks/useAccounts";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Account } from "@/types/electron";
import { useEffect, useRef, useState } from "react";

type AccountFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId?: number | null;
  account?: Account | null;
};

type FormState = typeof empty;

const empty = {
  name: "",
  number: "",
  type: "bank" as string,
  balance: "0",
  currency: "GBP",
  notes: "",
  interestRate: "",
  creditLimit: "",
  shouldClose: false,
};

const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "credit_card", label: "Credit Card" },
  { value: "loan", label: "Loan" },
  { value: "investment", label: "Investment" },
  { value: "cash", label: "Cash" },
];

function formFromAccount(account: Account): FormState {
  return {
    name: account.name,
    number: account.number || "",
    type: account.type,
    balance: account.balance.toFixed(2),
    currency: account.currency,
    notes: account.notes || "",
    interestRate: account.interestRate?.toString() || "",
    creditLimit: account.creditLimit?.toString() || "",
    shouldClose: false,
  };
}

function sameForm(a: FormState, b: FormState) {
  return (Object.keys(a) as (keyof FormState)[]).every((k) => a[k] === b[k]);
}

export function AccountForm({
  open,
  onOpenChange,
  editingId,
  account,
}: AccountFormProps) {
  const { create, update, remove } = useAccounts();
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [form, setForm] = useState(empty);
  const [baseline, setBaseline] = useState(empty);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const isEditing = editingId != null;
  // Read through a ref so a background refetch (new object identity) cannot
  // reset a draft that is being edited.
  const accountRef = useRef(account);
  accountRef.current = account;
  const accountLoaded = account != null;

  useEffect(() => {
    if (!open) return;
    const current = accountRef.current;
    const next = isEditing && current ? formFromAccount(current) : empty;
    setForm(next);
    setBaseline(next);
    setSaveError(null);
    setConfirmClose(false);
    setConfirmDiscard(false);
  }, [editingId, open, isEditing, accountLoaded]);

  const dirty = !sameForm(form, baseline);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleClose() {
    setConfirmClose(false);
    setConfirmDiscard(false);
    onOpenChange(false);
  }

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    handleClose();
  }

  async function run(action: () => Promise<unknown>, failure: string) {
    // Guards Enter + click (or a double tap) before isPending re-renders.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaveError(null);
    try {
      await action();
    } catch (err) {
      // Keep the surface open with the draft intact so the user can retry.
      setSaveError(
        `${failure} ${err instanceof Error ? err.message : "Please try again."}`,
      );
      return;
    } finally {
      submittingRef.current = false;
    }
    handleClose();
  }

  async function save() {
    if (isEditing && account) {
      if (form.shouldClose) {
        setConfirmClose(true);
        return;
      }

      await run(
        () =>
          update.mutateAsync({
            id: account.id,
            data: {
              name: form.name,
              number: form.number || null,
              notes: form.notes || null,
              interestRate: form.interestRate
                ? parseFloat(form.interestRate)
                : null,
              creditLimit: form.creditLimit
                ? parseFloat(form.creditLimit)
                : null,
            },
          }),
        "Couldn't save the account.",
      );
    } else {
      const isAssumedNegative =
        form.type === "credit_card" || form.type === "loan";
      await run(
        () =>
          create.mutateAsync({
            name: form.name,
            number: form.number || null,
            type: form.type as
              | "bank"
              | "credit_card"
              | "loan"
              | "investment"
              | "cash",
            balance: isAssumedNegative
              ? -(parseFloat(form.balance) || 0)
              : parseFloat(form.balance) || 0,
            currency: form.currency || "GBP",
            notes: form.notes || null,
            interestRate: form.interestRate
              ? parseFloat(form.interestRate)
              : null,
            creditLimit: form.creditLimit
              ? parseFloat(form.creditLimit)
              : null,
          } as any), // Type assertion to work around TypeScript cache issue
        "Couldn't create the account.",
      );
    }
  }

  async function handleConfirmClose() {
    if (isEditing && editingId != null) {
      await run(
        () => remove.mutateAsync(editingId),
        "Couldn't close the account.",
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save();
  }

  const isPending = create.isPending || update.isPending || remove.isPending;

  // Implicit dismissal (swipe, Escape, backdrop, close icon) never silently
  // discards a draft and is ignored while a save is in flight.
  function handleOverlayOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (isPending || submittingRef.current) return;
    requestClose();
  }

  const fieldClass = "flex flex-col gap-1.5";

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOverlayOpenChange}>
      <ResponsiveOverlayContent
        size="expanded"
        dialogClassName="sm:max-w-sm"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            {isEditing ? "Edit Account" : "New Account"}
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            {isEditing
              ? "Update account details. Balance and account type cannot be changed."
              : "Add a new account to track."}
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className={fieldClass}>
              <Label htmlFor="acc-name">Name</Label>
              <Input
                id="acc-name"
                placeholder="e.g. Current Account, Visa..."
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={fieldClass}>
                <Label htmlFor="acc-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => set("type", v as string)}
                  disabled={isEditing}
                >
                  <SelectTrigger id="acc-type" className="w-full">
                    <SelectValue>
                      {ACCOUNT_TYPES.find((t) => t.value === form.type)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className={fieldClass}>
                <Label htmlFor="acc-number">Account Number</Label>
                <Input
                  id="acc-number"
                  placeholder="Optional"
                  value={form.number}
                  onChange={(e) => set("number", e.target.value)}
                />
              </div>
            </div>

            <div className={fieldClass}>
              <Label htmlFor="acc-balance">
                {form.type === "credit_card" || form.type === "loan"
                  ? "Initial balance owed"
                  : "Opening Balance"}
              </Label>
              <Input
                id="acc-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={form.balance}
                onChange={(e) => set("balance", e.target.value)}
                disabled={isEditing}
              />
            </div>

            {form.type === "credit_card" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className={fieldClass}>
                  <Label htmlFor="acc-credit-limit">Credit Limit</Label>
                  <Input
                    id="acc-credit-limit"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="e.g. 5000"
                    value={form.creditLimit}
                    onChange={(e) => set("creditLimit", e.target.value)}
                  />
                </div>

                <div className={fieldClass}>
                  <Label htmlFor="acc-interest-rate">Interest Rate (%)</Label>
                  <Input
                    id="acc-interest-rate"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    placeholder="e.g. 19.9"
                    value={form.interestRate}
                    onChange={(e) => set("interestRate", e.target.value)}
                  />
                </div>
              </div>
            )}

            {form.type === "loan" && (
              <div className={fieldClass}>
                <Label htmlFor="acc-interest-rate">Interest Rate (%)</Label>
                <Input
                  id="acc-interest-rate"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  placeholder="e.g. 5.5"
                  value={form.interestRate}
                  onChange={(e) => set("interestRate", e.target.value)}
                />
              </div>
            )}

            <div className={fieldClass}>
              <Label htmlFor="acc-currency">Currency</Label>
              <Input
                id="acc-currency"
                placeholder="GBP"
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
              />
            </div>

            {isEditing && (
              <div className="flex min-h-11 items-center gap-2 border-t pt-2 md:min-h-0">
                <input
                  id="acc-close"
                  type="checkbox"
                  checked={form.shouldClose}
                  onChange={(e) => set("shouldClose", e.target.checked)}
                  className="size-5 rounded border-input md:size-4"
                />
                <Label
                  htmlFor="acc-close"
                  className="cursor-pointer py-2 font-normal"
                >
                  Close Account
                </Label>
              </div>
            )}
            {/* Hidden submit button so pressing Enter in any input triggers onSubmit */}
            <button type="submit" className="sr-only" aria-hidden tabIndex={-1} />
          </form>
          {saveError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {saveError}
            </p>
          )}
        </ResponsiveOverlayBody>

        <ResponsiveOverlayFooter>
          <Button variant="outline" onClick={requestClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isPending}>
            {isPending ? "Saving…" : isEditing ? "Save Changes" : "Create"}
          </Button>
        </ResponsiveOverlayFooter>

        <ConfirmDialog
          open={confirmClose}
          onOpenChange={(o) => !o && setConfirmClose(false)}
          title="Close Account?"
          description="This is permanent and cannot be undone. The account will be archived and excluded from all calculations."
          confirmLabel="Close Account"
          onConfirm={handleConfirmClose}
        />
        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={(o) => !o && setConfirmDiscard(false)}
          title="Discard changes?"
          description="Your changes to this account haven't been saved."
          confirmLabel="Discard"
          onConfirm={handleClose}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
