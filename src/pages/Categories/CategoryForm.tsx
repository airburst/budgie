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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCategories } from "@/hooks/useCategories";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Category } from "@/types/electron";
import { useEffect, useRef, useState } from "react";

type CategorySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
  parentId?: number | null;
};

type FormState = typeof empty;

const empty = { name: "", expenseType: "expense" as Category["expenseType"] };

function sameForm(a: FormState, b: FormState) {
  return a.name === b.name && a.expenseType === b.expenseType;
}

export function CategorySheet({
  open,
  onOpenChange,
  editingId,
  parentId,
}: CategorySheetProps) {
  const { categories, create, update } = useCategories();
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [baseline, setBaseline] = useState<FormState>(empty);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const editing = editingId ? categories.find((c) => c.id === editingId) : null;

  const resolvedParentId =
    editing != null ? editing.parentId : (parentId ?? null);
  const parentName =
    resolvedParentId != null
      ? (categories.find((c) => c.id === resolvedParentId)?.name ?? null)
      : null;

  // Read through a ref so a background refetch (new object identity) cannot
  // reset a draft that is being edited.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const editingLoaded = editing != null;

  useEffect(() => {
    // Leave content untouched while the surface animates closed.
    if (!open) return;
    const current = editingRef.current;
    const next: FormState = current
      ? { name: current.name, expenseType: current.expenseType }
      : empty;
    setForm(next);
    setBaseline(next);
    setSaveError(null);
    setConfirmDiscard(false);
  }, [editingId, open, editingLoaded]);

  const dirty = !sameForm(form, baseline);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleClose() {
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

  const isPending = create.isPending || update.isPending;

  async function save() {
    const name = form.name.trim();
    if (!name) return;
    // Guards Enter + click (or a double tap) before isPending re-renders.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaveError(null);
    const data: Omit<Category, "id" | "createdAt" | "deleted"> = {
      name,
      expenseType: form.expenseType,
      parentId: resolvedParentId,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, data });
      } else {
        await create.mutateAsync(data);
      }
    } catch (err) {
      // Keep the surface open with the draft intact so the user can retry.
      setSaveError(
        `Couldn't save the category. ${err instanceof Error ? err.message : "Please try again."}`,
      );
      return;
    } finally {
      submittingRef.current = false;
    }
    handleClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save();
  }

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

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOverlayOpenChange}>
      <ResponsiveOverlayContent
        dialogClassName="sm:max-w-sm"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            {editing
              ? "Edit Category"
              : parentName
                ? "New Sub-category"
                : "New Category"}
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            {editing
              ? "Update this category."
              : parentName
                ? `Add a sub-category under ${parentName}.`
                : "Add a new spending category."}
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {parentName && (
              <div className="flex flex-col gap-1.5">
                <Label>Parent category</Label>
                <p className="text-sm break-words text-muted-foreground">
                  {parentName}
                </p>
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
              <Label id="cat-type-label">Type</Label>
              <RadioGroup
                aria-labelledby="cat-type-label"
                value={form.expenseType}
                onValueChange={(v) => set("expenseType", v)}
                className="flex flex-row gap-4"
              >
                {(
                  [
                    ["expense", "Expense"],
                    ["income", "Income"],
                  ] as const
                ).map(([value, label]) => (
                  <div
                    key={value}
                    className="flex min-h-11 items-center gap-2 md:min-h-0"
                  >
                    <RadioGroupItem id={`type-${value}`} value={value} />
                    <Label
                      htmlFor={`type-${value}`}
                      className="min-h-11 cursor-pointer pr-2 font-normal md:min-h-0"
                    >
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            {/* Hidden submit button so pressing Enter in the input submits */}
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
          <Button onClick={save} disabled={isPending || !form.name.trim()}>
            {isPending ? "Saving…" : editing ? "Save Changes" : "Create"}
          </Button>
        </ResponsiveOverlayFooter>

        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={(o) => !o && setConfirmDiscard(false)}
          title="Discard changes?"
          description="Your changes to this category haven't been saved."
          confirmLabel="Discard"
          onConfirm={handleClose}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
