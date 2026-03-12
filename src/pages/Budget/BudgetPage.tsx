import { useBudgetAllocations } from "@/hooks/useBudgetAllocations";
import { useBudgetSummary } from "@/hooks/useBudgetSummary";
import { useCategories } from "@/hooks/useCategories";
import { useEnvelopeCategories } from "@/hooks/useEnvelopeCategories";
import { useEnvelopes } from "@/hooks/useEnvelopes";
import { cn } from "@/lib/utils";
import Layout from "@/pages/layout";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { useState } from "react";
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
  const { envelopes } = useEnvelopes();
  const { upsert, quickFill } = useBudgetAllocations(month);
  const { categories } = useCategories();
  const { mappings } = useEnvelopeCategories();

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const envelopeMap = new Map(envelopes.map((e) => [e.id, e]));

  const prevMonthStr = (() => {
    const parts = month.split("-").map(Number);
    const d = new Date(parts[0]!, parts[1]! - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

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
          <BudgetOnboarding
            categories={categories}
            allMappings={mappings}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {summary.envelopes.map((env) => {
              const catNames = env.categoryIds
                .map((id) => categoryMap.get(id)?.name)
                .filter(Boolean) as string[];
              const envelope = envelopeMap.get(env.envelopeId);
              return (
                <EnvelopeRow
                  key={env.envelopeId}
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
                    envelope ? (
                      <EnvelopeEditButton
                        envelope={envelope}
                        categories={categories}
                        allMappings={mappings}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </div>
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
