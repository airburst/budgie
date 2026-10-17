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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePayees } from "@/hooks/usePayees";
import type { Payee } from "@/types/electron";
import { useEffect, useRef, useState } from "react";

type PayeeFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: number | null;
};

type FormState = typeof empty;

const empty = { name: "", categoryId: "", withdrawal: "", deposit: "" };

function sameForm(a: FormState, b: FormState) {
  return (Object.keys(a) as (keyof FormState)[]).every((k) => a[k] === b[k]);
}

function formFromPayee(payee: Payee): FormState {
  return {
    name: payee.name,
    categoryId: payee.categoryId ? String(payee.categoryId) : "",
    withdrawal:
      payee.amount !== null && payee.amount < 0
        ? Math.abs(payee.amount).toFixed(2)
        : "",
    deposit:
      payee.amount !== null && payee.amount > 0
        ? payee.amount.toFixed(2)
        : "",
  };
}

export function PayeeForm({ open, onOpenChange, editingId }: PayeeFormProps) {
  const { payees, create, update } = usePayees();
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [form, setForm] = useState<FormState>(empty);
  const [baseline, setBaseline] = useState<FormState>(empty);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const editing = editingId ? payees.find((p) => p.id === editingId) : null;

  // Read through a ref so a background refetch (new object identity) cannot
  // reset a draft that is being edited.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const editingLoaded = editing != null;

  useEffect(() => {
    // Leave content untouched while the surface animates closed.
    if (!open) return;
    const current = editingRef.current;
    const next = current ? formFromPayee(current) : empty;
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
    if (!form.name.trim()) return;
    // Guards Enter + click (or a double tap) before isPending re-renders.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaveError(null);
    const amount =
      (parseFloat(form.deposit) || 0) - (parseFloat(form.withdrawal) || 0);
    const data: Omit<Payee, "id" | "createdAt"> = {
      name: form.name.trim(),
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      amount: amount !== 0 ? amount : null,
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
        `Couldn't save the payee. ${err instanceof Error ? err.message : "Please try again."}`,
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
        size="expanded"
        dialogClassName="sm:max-w-sm"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            {editing ? "Edit Payee" : "New Payee"}
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            {editing
              ? "Update the default category and amount for this payee."
              : "Add a payee with a default category and amount."}
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody>
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="payee-withdrawal">Default withdrawal</Label>
                <Input
                  id="payee-withdrawal"
                  type="number"
                  inputMode="decimal"
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
                <Label htmlFor="payee-deposit">Default deposit</Label>
                <Input
                  id="payee-deposit"
                  type="number"
                  inputMode="decimal"
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
            {/* Hidden submit button so pressing Enter in an input submits */}
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
          description="Your changes to this payee haven't been saved."
          confirmLabel="Discard"
          onConfirm={handleClose}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
