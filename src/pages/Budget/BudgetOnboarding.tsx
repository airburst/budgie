import { Button } from "@/components/ui/button";
import { useEnvelopeCategories } from "@/hooks/useEnvelopeCategories";
import { useEnvelopes } from "@/hooks/useEnvelopes";
import type { Category } from "@/types/electron";
import { useRef, useState } from "react";
import { type BudgetTemplate, BUDGET_TEMPLATES } from "./budget-templates";

type Props = {
  categories: Category[];
  onCreateFromScratch: () => void;
};

export function BudgetOnboarding({ categories, onCreateFromScratch }: Props) {
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const { create: createEnvelope } = useEnvelopes();
  const { create: createMapping } = useEnvelopeCategories();

  const budgetableCategories = categories.filter(
    (c) => c.expenseType !== "income" && !c.deleted,
  );

  const matchCategories = (patterns: string[]): number[] => {
    const matched: number[] = [];
    for (const pattern of patterns) {
      const lowerPattern = pattern.toLowerCase();
      // Match by name (case-insensitive), including children of matched parents
      for (const cat of budgetableCategories) {
        if (
          cat.name.toLowerCase() === lowerPattern &&
          !matched.includes(cat.id)
        ) {
          matched.push(cat.id);
          // Also include children
          for (const child of budgetableCategories) {
            if (child.parentId === cat.id && !matched.includes(child.id)) {
              matched.push(child.id);
            }
          }
        }
      }
    }
    return matched;
  };

  const applyTemplate = async (template: BudgetTemplate) => {
    // A double tap would otherwise create every envelope twice.
    if (applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    try {
      await createFromTemplate(template);
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  const createFromTemplate = async (template: BudgetTemplate) => {
    const usedCategoryIds = new Set<number>();

    for (let i = 0; i < template.envelopes.length; i++) {
      const envDef = template.envelopes[i]!;
      const rows = await createEnvelope.mutateAsync({
        name: envDef.name,
        active: true,
        sortOrder: i,
      });
      const envelopeId = rows[0]?.id;
      if (!envelopeId) continue;

      const categoryIds = matchCategories(envDef.categoryPatterns).filter(
        (id) => !usedCategoryIds.has(id),
      );
      for (const catId of categoryIds) {
        try {
          await createMapping.mutateAsync({ envelopeId, categoryId: catId });
          usedCategoryIds.add(catId);
        } catch {
          // category may already be mapped — skip
        }
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-8 py-6 md:py-12">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Get started with budgeting</h2>
        <p className="text-muted-foreground text-sm mt-2 max-w-md">
          Envelope budgeting assigns every pound of income to an envelope. Track
          spending per envelope and aim for Available to Budget = £0.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 max-w-2xl w-full">
        {BUDGET_TEMPLATES.map((template) => (
          <button
            key={template.name}
            onClick={() => applyTemplate(template)}
            disabled={applying}
            className="bg-card min-h-11 rounded-lg border p-4 text-left transition-colors hover:border-primary disabled:opacity-50"
          >
            <h3 className="font-medium">{template.name}</h3>
            <p className="text-muted-foreground text-xs mt-1">
              {template.description}
            </p>
            <p className="text-muted-foreground text-xs mt-2">
              {template.envelopes.map((e) => e.name).join(" · ")}
            </p>
          </button>
        ))}
      </div>

      <Button
        variant="outline"
        className="min-h-11 md:min-h-8"
        onClick={onCreateFromScratch}
        disabled={applying}
      >
        Create from scratch
      </Button>
    </div>
  );
}
