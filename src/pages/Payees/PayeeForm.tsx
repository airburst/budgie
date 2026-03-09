import { CategoryCombobox } from "@/components/CategoryCombobox";
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
import { usePayees } from "@/hooks/usePayees";
import type { Payee } from "@/types/electron";
import { useEffect, useState } from "react";

type PayeeFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
};

const empty = { name: "", categoryId: "", withdrawal: "", deposit: "" };

export function PayeeForm({ open, onOpenChange, editingId }: PayeeFormProps) {
  const { payees, create, update } = usePayees();
  const [form, setForm] = useState(empty);

  const editing = editingId ? payees.find((p) => p.id === editingId) : null;

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        categoryId: editing.categoryId ? String(editing.categoryId) : "",
        withdrawal:
          editing.amount !== null && editing.amount < 0
            ? Math.abs(editing.amount).toFixed(2)
            : "",
        deposit:
          editing.amount !== null && editing.amount > 0
            ? editing.amount.toFixed(2)
            : "",
      });
    } else {
      setForm(empty);
    }
  }, [editingId, open]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    const amount =
      (parseFloat(form.deposit) || 0) - (parseFloat(form.withdrawal) || 0);
    const data: Omit<Payee, "id" | "createdAt"> = {
      name: form.name.trim(),
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      amount: amount !== 0 ? amount : null,
    };
    if (editing) {
      await update.mutateAsync({ id: editing.id, data });
    } else {
      await create.mutateAsync(data);
    }
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save();
  }

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Payee" : "New Payee"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the default category and amount for this payee."
              : "Add a payee with a default category and amount."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payee-name">Name</Label>
            <Input
              id="payee-name"
              placeholder="e.g. Starbucks"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
              disabled={!!editing}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Default category</Label>
            <CategoryCombobox
              value={form.categoryId}
              onValueChange={(v) => set("categoryId", v)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payee-withdrawal">Default withdrawal</Label>
              <Input
                id="payee-withdrawal"
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
              <Label htmlFor="payee-deposit">Default deposit</Label>
              <Input
                id="payee-deposit"
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
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isPending || !form.name.trim()}>
            {editing ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
