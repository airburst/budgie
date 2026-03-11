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
import { useState } from "react";

type AccountFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
};

const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "credit_card", label: "Credit Card" },
  { value: "loan", label: "Loan" },
  { value: "investment", label: "Investment" },
  { value: "cash", label: "Cash" },
];

export function AccountForm({ open, onOpenChange }: AccountFormProps) {
  const { create } = useAccounts();
  const [form, setForm] = useState(empty);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleClose() {
    setForm(empty);
    onOpenChange(false);
  }

  async function save() {
    const isCreditCard = form.type === "credit_card";
    await create.mutateAsync({
      name: form.name,
      number: form.number || null,
      type: form.type as
        | "bank"
        | "credit_card"
        | "loan"
        | "investment"
        | "cash",
      balance: isCreditCard
        ? -(parseFloat(form.balance) || 0)
        : parseFloat(form.balance) || 0,
      currency: form.currency || "GBP",
      notes: form.notes || null,
      interestRate: form.interestRate ? parseFloat(form.interestRate) : null,
      creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : null,
    });
    handleClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Account</DialogTitle>
          <DialogDescription>Add a new account to track.</DialogDescription>
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
              {form.type === "credit_card"
                ? "Initial balance owed"
                : "Opening Balance"}
            </Label>
            <Input
              id="acc-balance"
              type="number"
              step="0.01"
              value={form.balance}
              onChange={(e) => set("balance", e.target.value)}
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acc-currency">Currency</Label>
            <Input
              id="acc-currency"
              placeholder="GBP"
              value={form.currency}
              onChange={(e) => set("currency", e.target.value)}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={create.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
