import { Button } from "@/components/ui/button";
import { useBudgetAllocations } from "@/hooks/useBudgetAllocations";
import { useBudgetSummary } from "@/hooks/useBudgetSummary";
import { useCategories } from "@/hooks/useCategories";
import { useEnvelopeCategories } from "@/hooks/useEnvelopeCategories";
import { useEnvelopes } from "@/hooks/useEnvelopes";
import { cn } from "@/lib/utils";
import Layout from "@/pages/layout";
import type { Envelope } from "@/types/electron";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { BudgetOnboarding } from "./BudgetOnboarding";
import { EnvelopeEditButton, EnvelopeFormDialog } from "./EnvelopeFormDialog";
import { EnvelopeRow } from "./EnvelopeRow";
import { MonthSelector } from "./MonthSelector";
import { MoveMoneyDialog } from "./MoveMoneyDialog";
import { UnbudgetedSection } from "./UnbudgetedSection";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function BudgetPage() {
  const [month, setMonth] = useState(currentMonth);
  const summary = useBudgetSummary(month);
  const { envelopes, reorder } = useEnvelopes();
  const { upsert, quickFill } = useBudgetAllocations(month);
  const { categories } = useCategories();
  const { mappings } = useEnvelopeCategories();

  const [orderedEnvelopes, setOrderedEnvelopes] =
    useState<Envelope[]>(envelopes);
  useEffect(() => {
    setOrderedEnvelopes(envelopes);
  }, [envelopes]);

  const sensors = useSensors(useSensor(PointerSensor));

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const summaryMap = new Map(summary.envelopes.map((e) => [e.envelopeId, e]));

  const prevMonthStr = (() => {
    const parts = month.split("-").map(Number);
    const d = new Date(parts[0]!, parts[1]! - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedEnvelopes.findIndex((e) => e.id === active.id);
    const newIndex = orderedEnvelopes.findIndex((e) => e.id === over.id);
    const newItems = arrayMove(orderedEnvelopes, oldIndex, newIndex);
    setOrderedEnvelopes(newItems);
    reorder.mutate(newItems.map((e, idx) => ({ id: e.id, sortOrder: idx })));
  };

  return (
    <Layout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Budget</h1>
            {envelopes.length > 0 && (
              <p className="text-muted-foreground text-sm">
                Available to Budget:{" "}
                <span
                  className={cn(
                    "font-medium",
                    summary.availableToBudget < 0
                      ? "text-destructive"
                      : summary.availableToBudget === 0
                        ? "text-green-600"
                        : "text-foreground",
                  )}
                >
                  £{summary.availableToBudget.toFixed(2)}
                </span>
              </p>
            )}
          </div>
          {envelopes.length > 0 && (
            <div className="flex items-center gap-2">
              <EnvelopeFormDialog
                categories={categories}
                allMappings={mappings}
              />
              <MoveMoneyDialog month={month} envelopes={envelopes} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => quickFill.mutate(prevMonthStr)}
                disabled={quickFill.isPending}
              >
                <Copy className="size-4 mr-1" />
                Fill from last month
              </Button>
              <MonthSelector month={month} onChange={setMonth} />
            </div>
          )}
        </div>

        {envelopes.length === 0 ? (
          <BudgetOnboarding categories={categories} allMappings={mappings} />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedEnvelopes.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] gap-x-4 gap-y-2">
                {orderedEnvelopes.map((envelope) => {
                  const env = summaryMap.get(envelope.id);
                  if (!env) return null;
                  const catNames = env.categoryIds
                    .map((id) => categoryMap.get(id)?.name)
                    .filter(Boolean) as string[];
                  return (
                    <EnvelopeRow
                      key={envelope.id}
                      envelopeId={envelope.id}
                      name={env.name}
                      assigned={env.assigned}
                      activity={env.activity}
                      available={env.available}
                      underfunded={env.underfunded}
                      categoryNames={catNames}
                      onAssignedChange={(value) =>
                        upsert.mutate({
                          envelopeId: env.envelopeId,
                          assigned: value,
                        })
                      }
                      editButton={
                        <EnvelopeEditButton
                          envelope={envelope}
                          categories={categories}
                          allMappings={mappings}
                        />
                      }
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {envelopes.length > 0 && (
          <UnbudgetedSection
            total={summary.unbudgetedActivity}
            categories={summary.unbudgetedCategories}
          />
        )}
      </div>
    </Layout>
  );
}
