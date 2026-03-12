import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEnvelopeCategories } from "@/hooks/useEnvelopeCategories";
import { useEnvelopes } from "@/hooks/useEnvelopes";
import type { Category, Envelope, EnvelopeCategory } from "@/types/electron";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  categories: Category[];
  allMappings: EnvelopeCategory[];
  envelope?: Envelope;
  trigger?: React.ReactElement;
};

export function EnvelopeFormDialog({
  categories,
  allMappings,
  envelope,
  trigger,
}: Props) {
  const { create: createEnvelope, update: updateEnvelope, remove: removeEnvelope } =
    useEnvelopes();
  const { create: createMapping, removeByEnvelope } = useEnvelopeCategories();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(envelope?.name ?? "");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<number>>(
    new Set(),
  );

  useEffect(() => {
    if (open && envelope) {
      setName(envelope.name);
      const ids = allMappings
        .filter((m) => m.envelopeId === envelope.id)
        .map((m) => m.categoryId);
      setSelectedCategoryIds(new Set(ids));
    } else if (open) {
      setName("");
      setSelectedCategoryIds(new Set());
    }
  }, [open, envelope, allMappings]);

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

  const handleSave = async () => {
    if (!name.trim()) return;

    if (envelope) {
      await updateEnvelope.mutateAsync({ id: envelope.id, data: { name } });
      await removeByEnvelope.mutateAsync(envelope.id);
      for (const catId of selectedCategoryIds) {
        await createMapping.mutateAsync({
          envelopeId: envelope.id,
          categoryId: catId,
        });
      }
    } else {
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
    }
    setOpen(false);
  };

  const handleDelete = async () => {
    if (!envelope) return;
    await removeByEnvelope.mutateAsync(envelope.id);
    await removeEnvelope.mutateAsync(envelope.id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm">
              <Plus className="size-4 mr-1" />
              New Envelope
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {envelope ? "Edit Envelope" : "New Envelope"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="e.g. Groceries"
              autoFocus
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Categories</span>
            <div className="max-h-60 overflow-y-auto rounded-md border p-2">
              {parentCategories.map((parent) => {
                const children = childrenOf(parent.id);
                const items =
                  children.length > 0 ? children : [parent];
                return (
                  <div key={parent.id} className="mb-2">
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
                          className={`flex items-center gap-2 py-0.5 pl-2 text-sm ${disabled ? "opacity-40" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCategoryIds.has(cat.id)}
                            onChange={() => toggleCategory(cat.id)}
                            disabled={disabled}
                          />
                          {cat.name}
                          {disabled && (
                            <span className="text-xs text-muted-foreground">
                              (mapped)
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          {envelope && (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="size-4 mr-1" />
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={!name.trim()}>
            {envelope ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EnvelopeEditButton({
  envelope,
  categories,
  allMappings,
}: {
  envelope: Envelope;
  categories: Category[];
  allMappings: EnvelopeCategory[];
}) {
  return (
    <EnvelopeFormDialog
      envelope={envelope}
      categories={categories}
      allMappings={allMappings}
      trigger={
        <Button variant="ghost" size="icon-sm">
          <Pencil className="size-3" />
        </Button>
      }
    />
  );
}
