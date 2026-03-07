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
import { useCategories } from "@/hooks/useCategories";
import type { Category } from "@/types/electron";
import { useEffect, useState } from "react";

type CategorySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  parentId?: number | null;
};

const empty = { name: "", color: "#6366f1", icon: "" };

export function CategorySheet({
  open,
  onOpenChange,
  editingId,
  parentId,
}: CategorySheetProps) {
  const { categories, create, update } = useCategories();
  const [form, setForm] = useState(empty);

  const editing = editingId ? categories.find((c) => c.id === editingId) : null;

  const resolvedParentId = editing != null ? editing.parentId : parentId ?? null;
  const parentName = resolvedParentId != null
    ? (categories.find((c) => c.id === resolvedParentId)?.name ?? null)
    : null;

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        color: editing.color ?? "#6366f1",
        icon: editing.icon ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [editingId, open]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Omit<Category, "id" | "createdAt"> = {
      name: form.name,
      color: form.color || null,
      icon: form.icon || null,
      parentId: resolvedParentId,
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit Category" : parentName ? "New Sub-category" : "New Category"}
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
            <Label htmlFor="cat-color">Colour</Label>
            <div className="flex items-center gap-2">
              <input
                id="cat-color"
                type="color"
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
              <Input
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
                placeholder="#6366f1"
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cat-icon">Icon</Label>
            <Input
              id="cat-icon"
              placeholder="e.g. ShoppingCart, Home..."
              value={form.icon}
              onChange={(e) => set("icon", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Lucide icon name (optional)
            </p>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit as never} disabled={isPending}>
            {editing ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
