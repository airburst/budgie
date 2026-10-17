import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  ArrowLeftRight,
  Copy,
  MoreHorizontalIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BudgetOnboarding } from "./BudgetOnboarding";
import { EnvelopeFormDialog } from "./EnvelopeFormDialog";
import { EnvelopeRow } from "./EnvelopeRow";
import { MonthSelector, formatMonth, shiftMonth } from "./MonthSelector";
import { MoveMoneyDialog } from "./MoveMoneyDialog";
import { UnbudgetedSection } from "./UnbudgetedSection";
import { formatMoney } from "./money";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Phone: envelope | available | menu. lg: one aligned column per value.
const LIST_COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 lg:grid-cols-[minmax(11rem,1.4fr)_auto_minmax(6rem,1fr)_auto_auto_auto] lg:gap-x-6";

type FormTarget = "new" | number | null;
type Notice = { kind: "success" | "error"; text: string };

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
  const envelopesRef = useRef(envelopes);
  envelopesRef.current = envelopes;

  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [fillConfirmOpen, setFillConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [orderAnnouncement, setOrderAnnouncement] = useState("");
  const [orderError, setOrderError] = useState<string | null>(null);

  useEffect(() => {
    setNotice(null);
  }, [month]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const summaryMap = new Map(summary.envelopes.map((e) => [e.envelopeId, e]));

  const prevMonthStr = shiftMonth(month, -1);

  // Drag, keyboard drag and Move up / Move down all persist through here.
  const persistOrder = (next: Envelope[]) => {
    setOrderedEnvelopes(next);
    setOrderError(null);
    reorder.mutate(next.map((e, idx) => ({ id: e.id, sortOrder: idx })), {
      onError: () => {
        setOrderedEnvelopes(envelopesRef.current);
        setOrderError("Couldn't save the new order. Please try again.");
      },
    });
  };

  const announceMove = (next: Envelope[], id: number) => {
    const moved = next.find((e) => e.id === id);
    setOrderAnnouncement(
      `${moved?.name ?? "Envelope"} moved to position ${next.findIndex((e) => e.id === id) + 1} of ${next.length}.`,
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedEnvelopes.findIndex((e) => e.id === active.id);
    const newIndex = orderedEnvelopes.findIndex((e) => e.id === over.id);
    const next = arrayMove(orderedEnvelopes, oldIndex, newIndex);
    persistOrder(next);
    announceMove(next, Number(active.id));
  };

  const moveEnvelope = (id: number, direction: -1 | 1) => {
    const from = orderedEnvelopes.findIndex((e) => e.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= orderedEnvelopes.length) return;
    const next = arrayMove(orderedEnvelopes, from, to);
    persistOrder(next);
    announceMove(next, id);
  };

  const runFill = async () => {
    setNotice(null);
    try {
      const rows = await quickFill.mutateAsync(prevMonthStr);
      setNotice({
        kind: "success",
        text:
          rows.length > 0
            ? `Filled ${rows.length} ${rows.length === 1 ? "envelope" : "envelopes"} from ${formatMonth(prevMonthStr)}.`
            : `Nothing to fill from ${formatMonth(prevMonthStr)}.`,
      });
    } catch {
      setNotice({
        kind: "error",
        text: `Couldn't fill from ${formatMonth(prevMonthStr)}. Please try again.`,
      });
    }
  };

  const editingEnvelope =
    typeof formTarget === "number"
      ? (envelopes.find((e) => e.id === formTarget) ?? null)
      : null;
  const hasEnvelopes = envelopes.length > 0;
  const available = summary.availableToBudget;

  return (
    <Layout>
      <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* The phone header already shows the route title. */}
          <h1 className="sr-only text-2xl font-semibold md:not-sr-only">
            Budget
          </h1>
          {hasEnvelopes && (
            <MonthSelector month={month} onChange={setMonth} />
          )}
        </div>

        {hasEnvelopes && (
          <>
            <section
              aria-labelledby="available-to-budget-label"
              className="rounded-xl border bg-card px-4 py-4"
            >
              <h2
                id="available-to-budget-label"
                className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
              >
                Available to budget
              </h2>
              <p
                data-slot="available-to-budget"
                className={cn(
                  "mt-1 text-2xl font-semibold tabular-nums",
                  available < 0
                    ? "text-destructive"
                    : available === 0
                      ? "text-green-700 dark:text-green-500"
                      : "text-foreground",
                )}
              >
                {formatMoney(available)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {available < 0
                  ? "Over-assigned: you have assigned more than you have."
                  : available === 0
                    ? "Every pound is assigned to an envelope."
                    : "Assign this to envelopes to reach £0.00."}
              </p>
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="min-w-0 flex-1 md:flex-none"
                onClick={() => setFormTarget("new")}
              >
                <PlusIcon />
                Add envelope
              </Button>
              <Button
                variant="outline"
                className="min-w-0 flex-1 md:flex-none"
                onClick={() => setMoveOpen(true)}
              >
                <ArrowLeftRight />
                Move money
              </Button>
              <Button
                variant="outline"
                className="hidden lg:inline-flex"
                onClick={() => setFillConfirmOpen(true)}
                disabled={quickFill.isPending}
              >
                <Copy />
                Fill from last month
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-11 md:size-8 lg:hidden"
                      aria-label="More actions"
                    />
                  }
                >
                  <MoreHorizontalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    className="min-h-11 md:min-h-8"
                    disabled={quickFill.isPending}
                    onClick={() => setFillConfirmOpen(true)}
                  >
                    <Copy />
                    Fill from last month
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}

        {notice && (
          <p
            role={notice.kind === "error" ? "alert" : "status"}
            className={cn(
              "text-sm",
              notice.kind === "error"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {notice.text}
          </p>
        )}
        {orderError && (
          <p role="alert" className="text-sm text-destructive">
            {orderError}
          </p>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {orderAnnouncement}
        </p>

        {!hasEnvelopes ? (
          <BudgetOnboarding
            categories={categories}
            onCreateFromScratch={() => setFormTarget("new")}
          />
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
              <section aria-labelledby="envelopes-label">
                <h2
                  id="envelopes-label"
                  className="mb-2 text-sm font-semibold text-muted-foreground"
                >
                  Envelopes
                </h2>
                <div className={cn("grid gap-y-2", LIST_COLUMNS)}>
                  {/* Visual column captions only; each card carries its own labels. */}
                  <div
                    aria-hidden="true"
                    className="col-span-full hidden grid-cols-subgrid px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid"
                  >
                    <span>Envelope</span>
                    <span>Assigned</span>
                    <span>Progress</span>
                    <span className="text-right">Spent</span>
                    <span className="text-right">Available</span>
                    <span />
                  </div>
                  <ul className="col-span-full grid grid-cols-subgrid gap-y-2">
                    {orderedEnvelopes.map((envelope, index) => {
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
                          index={index}
                          count={orderedEnvelopes.length}
                          onAssignedChange={(value) =>
                            upsert.mutateAsync({
                              envelopeId: env.envelopeId,
                              assigned: value,
                            })
                          }
                          onEdit={() => setFormTarget(envelope.id)}
                          onMove={(direction) =>
                            moveEnvelope(envelope.id, direction)
                          }
                        />
                      );
                    })}
                  </ul>
                </div>
              </section>
            </SortableContext>
          </DndContext>
        )}

        {hasEnvelopes && (
          <UnbudgetedSection
            total={summary.unbudgetedActivity}
            categories={summary.unbudgetedCategories}
          />
        )}
      </div>

      <EnvelopeFormDialog
        open={formTarget === "new" || editingEnvelope != null}
        onOpenChange={(open) => {
          if (!open) setFormTarget(null);
        }}
        categories={categories}
        allMappings={mappings}
        envelope={editingEnvelope}
      />
      <MoveMoneyDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        month={month}
        envelopes={envelopes}
      />
      <ConfirmDialog
        open={fillConfirmOpen}
        onOpenChange={setFillConfirmOpen}
        title="Fill from last month?"
        description={`Copies ${formatMonth(prevMonthStr)} assignments into ${formatMonth(month)} for envelopes without one. Existing amounts are kept.`}
        confirmLabel="Fill"
        onConfirm={() => void runFill()}
      />
    </Layout>
  );
}
