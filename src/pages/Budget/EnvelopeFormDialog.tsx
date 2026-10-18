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
import { useEnvelopeCategories } from "@/hooks/useEnvelopeCategories";
import { useEnvelopes } from "@/hooks/useEnvelopes";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import type { Category, Envelope, EnvelopeCategory } from "@/types/electron";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  allMappings: EnvelopeCategory[];
  /** Omit (or null) to create a new envelope. */
  envelope?: Envelope | null;
};

type Draft = { name: string; categoryIds: Set<number> };

function sameDraft(a: Draft, b: Draft) {
  if (a.name !== b.name || a.categoryIds.size !== b.categoryIds.size) {
    return false;
  }
  for (const id of a.categoryIds) if (!b.categoryIds.has(id)) return false;
  return true;
}

export function EnvelopeFormDialog({
  open,
  onOpenChange,
  categories,
  allMappings,
  envelope,
}: Props) {
  const {
    create: createEnvelope,
    update: updateEnvelope,
    remove: removeEnvelope,
  } = useEnvelopes();
  const { create: createMapping, removeByEnvelope } = useEnvelopeCategories();
  const compact = useIsMobile();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(
    new Set(),
  );
  const [baseline, setBaseline] = useState<Draft>({
    name: "",
    categoryIds: new Set(),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const isEditing = envelope != null;
  const envelopeId = envelope?.id ?? null;

  // Read through refs so a background refetch (new object identity) cannot
  // reset a draft that is being edited.
  const envelopeRef = useRef(envelope);
  envelopeRef.current = envelope;
  const mappingsRef = useRef(allMappings);
  mappingsRef.current = allMappings;

  useEffect(() => {
    if (!open) return;
    const current = envelopeRef.current;
    const next: Draft = current
      ? {
          name: current.name,
          categoryIds: new Set(
            mappingsRef.current
              .filter((m) => m.envelopeId === current.id)
              .map((m) => m.categoryId),
          ),
        }
      : { name: "", categoryIds: new Set() };
    setName(next.name);
    setSelectedCategoryIds(new Set(next.categoryIds));
    setBaseline(next);
    setSaveError(null);
    setConfirmDelete(false);
    setConfirmDiscard(false);
  }, [open, envelopeId]);

  const dirty = !sameDraft(
    { name, categoryIds: selectedCategoryIds },
    baseline,
  );

  const budgetableCategories = categories.filter(
    (c) => c.expenseType !== "income" && !c.deleted,
  );

  const mappedByOthers = new Set(
    allMappings
      .filter((m) => !envelope || m.envelopeId !== envelope.id)
      .map((m) => m.categoryId),
  );

  const parentCategories = budgetableCategories.filter((c) => !c.parentId);
  const childrenOf = (parentId: number) =>
    budgetableCategories.filter((c) => c.parentId === parentId);

  const toggleCategory = (id: number) => {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  function handleClose() {
    setConfirmDelete(false);
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
    // Guards Enter + click (or a double tap) before `saving` re-renders.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
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
      setSaving(false);
    }
    handleClose();
  }

  async function save() {
    if (!name.trim()) return;
    if (envelope) {
      await run(async () => {
        await updateEnvelope.mutateAsync({ id: envelope.id, data: { name } });
        await removeByEnvelope.mutateAsync(envelope.id);
        for (const catId of selectedCategoryIds) {
          await createMapping.mutateAsync({
            envelopeId: envelope.id,
            categoryId: catId,
          });
        }
      }, "Couldn't save the envelope.");
    } else {
      await run(async () => {
        const rows = await createEnvelope.mutateAsync({
          name,
          active: true,
          sortOrder: 0,
        });
        const newId = rows[0]?.id;
        if (newId) {
          for (const catId of selectedCategoryIds) {
            await createMapping.mutateAsync({
              envelopeId: newId,
              categoryId: catId,
            });
          }
        }
      }, "Couldn't create the envelope.");
    }
  }

  async function handleDelete() {
    if (!envelope) return;
    await run(async () => {
      await removeByEnvelope.mutateAsync(envelope.id);
      await removeEnvelope.mutateAsync(envelope.id);
    }, "Couldn't delete the envelope.");
  }

  // Implicit dismissal (swipe, Escape, backdrop, close icon) never silently
  // discards a draft and is ignored while a save is in flight.
  function handleOverlayOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (saving || submittingRef.current) return;
    requestClose();
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOverlayOpenChange}>
      <ResponsiveOverlayContent
        size="expanded"
        dialogClassName="sm:max-w-md"
        initialFocus={compact ? titleRef : undefined}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle ref={titleRef} tabIndex={-1}>
            {isEditing ? "Edit Envelope" : "New Envelope"}
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Name the envelope and choose the categories whose spending it
            tracks.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="envelope-name">Name</Label>
              <Input
                id="envelope-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Groceries"
                autoFocus={!compact}
              />
            </div>

            <fieldset className="flex min-w-0 flex-col gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Categories</legend>
              <div className="rounded-md border p-2 md:max-h-60 md:overflow-y-auto">
                {parentCategories.map((parent) => {
                  const children = childrenOf(parent.id);
                  const items = children.length > 0 ? children : [parent];
                  return (
                    <div key={parent.id} className="mb-2 last:mb-0">
                      {children.length > 0 && (
                        <span className="text-xs font-medium text-muted-foreground">
                          {parent.name}
                        </span>
                      )}
                      {items.map((cat) => {
                        const disabled = mappedByOthers.has(cat.id);
                        return (
                          <label
                            key={cat.id}
                            className={cn(
                              "flex min-h-11 items-center gap-2 py-0.5 pl-2 text-sm md:min-h-0",
                              disabled && "opacity-40",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-5 shrink-0 md:size-4"
                              checked={selectedCategoryIds.has(cat.id)}
                              onChange={() => toggleCategory(cat.id)}
                              disabled={disabled}
                            />
                            <span className="min-w-0 break-words">
                              {cat.name}
                              {disabled && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  (mapped)
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </fieldset>
            {/* Hidden submit button so pressing Enter in the name triggers save */}
            <button type="submit" className="sr-only" aria-hidden tabIndex={-1} />
          </form>
          {saveError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {saveError}
            </p>
          )}
        </ResponsiveOverlayBody>

        <ResponsiveOverlayFooter>
          {envelope && (
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
            >
              <Trash2 className="mr-1 size-4" />
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : isEditing ? "Save" : "Create"}
          </Button>
        </ResponsiveOverlayFooter>

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={(o) => !o && setConfirmDelete(false)}
          title="Delete envelope?"
          description={`"${envelope?.name ?? ""}" will be removed from your budget and its category mappings cleared. Transactions are not changed.`}
          confirmLabel="Delete envelope"
          onConfirm={() => void handleDelete()}
        />
        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={(o) => !o && setConfirmDiscard(false)}
          title="Discard changes?"
          description="Your changes to this envelope haven't been saved."
          confirmLabel="Discard"
          onConfirm={handleClose}
        />
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
