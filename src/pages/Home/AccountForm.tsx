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
import { useAccounts } from "@/hooks/useAccounts";
import type { Account } from "@/types/electron";
import { useEffect, useState } from "react";

type AccountFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId?: number | null;
  account?: Account | null;
};

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

export function AccountForm({
  open,
  onOpenChange,
  editingId,
  account,
}: AccountFormProps) {
  const { create, update, remove } = useAccounts();
  const [form, setForm] = useState(empty);
  const [confirmClose, setConfirmClose] = useState(false);

  const isEditing = editingId != null;

  useEffect(() => {
    if (isEditing && account) {
      setForm({
        name: account.name,
        number: account.number || "",
        type: account.type,
        balance: account.balance.toFixed(2),
        currency: account.currency,
        notes: account.notes || "",
        interestRate: account.interestRate?.toString() || "",
        creditLimit: account.creditLimit?.toString() || "",
        shouldClose: false,
      });
    } else {
      setForm(empty);
    }
  }, [editingId, open, account, isEditing]);

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleClose() {
    setForm(empty);
    setConfirmClose(false);
    onOpenChange(false);
  }

  async function save() {
    if (isEditing && account) {
      // Editing mode
      if (form.shouldClose) {
        // Close account - trigger confirmation first
        setConfirmClose(true);
        return;
      }

      // Update account with partial data
      await update.mutateAsync({
        id: account.id,
        data: {
          name: form.name,
          number: form.number || null,
          notes: form.notes || null,
          interestRate: form.interestRate
            ? parseFloat(form.interestRate)
            : null,
          creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : null,
        },
      });
    } else {
      // Creating mode
      const isAssumedNegative =
        form.type === "credit_card" || form.type === "loan";
      await create.mutateAsync({
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
        interestRate: form.interestRate ? parseFloat(form.interestRate) : null,
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : null,
      } as any); // Type assertion to work around TypeScript cache issue
    }
    handleClose();
  }

  async function handleConfirmClose() {
    if (isEditing && editingId != null) {
      await remove.mutateAsync(editingId);
      handleClose();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save();
  }

  const isPending = create.isPending || update.isPending || remove.isPending;
  const isDisabled = confirmClose || isPending;

  return (
    <>
      <Dialog
        open={open && !confirmClose}
        onOpenChange={(o) => !o && handleClose()}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Account" : "New Account"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update account details. Balance and account type cannot be changed."
                : "Add a new account to track."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-name">Name</Label>
              <Input
                id="acc-name"
                placeholder="e.g. Current Account, Visa..."
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-number">Account Number</Label>
              <Input
                id="acc-number"
                placeholder="Optional"
                value={form.number}
                onChange={(e) => set("number", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-balance">
                {form.type === "credit_card" || form.type === "loan"
                  ? "Initial balance owed"
                  : "Opening Balance"}
              </Label>
              <Input
                id="acc-balance"
                type="number"
                step="0.01"
                value={form.balance}
                onChange={(e) => set("balance", e.target.value)}
                disabled={isEditing}
              />
            </div>

            {form.type === "credit_card" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="acc-credit-limit">Credit Limit</Label>
                  <Input
                    id="acc-credit-limit"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 5000"
                    value={form.creditLimit}
                    onChange={(e) => set("creditLimit", e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="acc-interest-rate">Interest Rate (%)</Label>
                  <Input
                    id="acc-interest-rate"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 19.9"
                    value={form.interestRate}
                    onChange={(e) => set("interestRate", e.target.value)}
                  />
                </div>
              </>
            )}

            {form.type === "loan" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="acc-interest-rate">Interest Rate (%)</Label>
                <Input
                  id="acc-interest-rate"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 5.5"
                  value={form.interestRate}
                  onChange={(e) => set("interestRate", e.target.value)}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acc-currency">Currency</Label>
              <Input
                id="acc-currency"
                placeholder="GBP"
                value={form.currency}
                onChange={(e) => set("currency", e.target.value)}
              />
            </div>

            {isEditing && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <input
                  id="acc-close"
                  type="checkbox"
                  checked={form.shouldClose}
                  onChange={(e) => set("shouldClose", e.target.checked)}
                  className="rounded border-input"
                />
                <Label
                  htmlFor="acc-close"
                  className="cursor-pointer font-normal"
                >
                  Close Account
                </Label>
              </div>
            )}
          </form>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isDisabled}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={isDisabled}>
              {isEditing ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for closing account */}
      <Dialog
        open={confirmClose}
        onOpenChange={(open) => !open && setConfirmClose(false)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Close Account?</DialogTitle>
            <DialogDescription className="text-destructive font-semibold">
              This is permanent and cannot be undone. The account will be
              archived and excluded from all calculations.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmClose(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmClose}
              disabled={isPending}
            >
              Close Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
