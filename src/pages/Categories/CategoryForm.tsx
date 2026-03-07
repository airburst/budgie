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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCategories } from "@/hooks/useCategories";
import type { Category } from "@/types/electron";
import { useEffect, useState } from "react";

type CategorySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  parentId?: number | null;
};

const empty = { name: "", expenseType: "expense" as "expense" | "income" };

export function CategorySheet({
  open,
  onOpenChange,
  editingId,
  parentId,
}: CategorySheetProps) {
  const { categories, create, update } = useCategories();
  const [form, setForm] = useState(empty);

  const editing = editingId ? categories.find((c) => c.id === editingId) : null;

  const resolvedParentId =
    editing != null ? editing.parentId : (parentId ?? null);
  const parentName =
    resolvedParentId != null
      ? (categories.find((c) => c.id === resolvedParentId)?.name ?? null)
      : null;

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        expenseType: editing.expenseType,
      });
    } else {
      setForm(empty);
    }
  }, [editingId, open]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    const data: Omit<Category, "id" | "createdAt" | "deleted"> = {
      name: form.name,
      expenseType: form.expenseType,
      parentId: resolvedParentId,
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
          <DialogTitle>
            {editing
              ? "Edit Category"
              : parentName
                ? "New Sub-category"
                : "New Category"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this category."
              : parentName
                ? `Add a sub-category under ${parentName}.`
                : "Add a new spending category."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {parentName && (
            <div className="flex flex-col gap-1.5">
              <Label>Parent category</Label>
              <p className="text-sm text-muted-foreground">{parentName}</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              placeholder="e.g. Groceries, Rent..."
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <RadioGroup
              value={form.expenseType}
              onValueChange={(v) => set("expenseType", v)}
              className="flex flex-row gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id="type-expense" value="expense" />
                <Label
                  htmlFor="type-expense"
                  className="cursor-pointer font-normal"
                >
                  Expense
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="type-income" value="income" />
                <Label
                  htmlFor="type-income"
                  className="cursor-pointer font-normal"
                >
                  Income
                </Label>
              </div>
            </RadioGroup>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isPending}>
            {editing ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
