import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useMinWidth } from "@/hooks/useMinWidth";
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import { CalendarDaysIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useMemo, useState } from "react";
import Layout from "../layout";
import { AccountFilter } from "./AccountFilter";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { ScheduledCalendar } from "./ScheduledCalendar";
import { ScheduledList } from "./ScheduledList";
import { ScheduledPaymentDialog } from "./ScheduledPaymentForm";
import { ScheduledSummaryCard } from "./ScheduledSummaryCard";
import { nextDueDateAfter } from "./schedule-advance";
import { accountScopeLabel } from "./scheduled-display";

type SheetMode = "details" | "edit";

export default function ScheduledTransactions() {
  const { scheduled, accounts, remove, skip } = useScheduledTransactions();
  const isDesktop = useMinWidth(1024);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>("edit");

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordingId, setRecordingId] = useState<number | null>(null);

  // Skip always asks first: it moves the due date and can't be undone.
  const [skippingId, setSkippingId] = useState<number | null>(null);
  const skipping = scheduled.find((s) => s.id === skippingId) ?? null;

  // Collapsed on entry; expanded state lives only as long as this view.
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Accounts that have at least one schedule.
  const uniqueAccounts = useMemo(() => {
    const seen = new Set<number>();
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const unique: Array<{ id: number; name: string }> = [];

    for (const s of scheduled) {
      if (!seen.has(s.accountId)) {
        const account = accountMap.get(s.accountId);
        if (account) {
          unique.push({ id: account.id, name: account.name });
          seen.add(s.accountId);
        }
      }
    }

    return unique;
  }, [scheduled, accounts]);

  // Track what is excluded, not what is selected: refetches and newly
  // scheduled accounts then never silently reset the user's filter.
  const [excludedAccountIds, setExcludedAccountIds] = useState<Set<number>>(
    () => new Set(),
  );
  const selectedAccountIds = useMemo(
    () =>
      new Set(
        uniqueAccounts
          .filter((a) => !excludedAccountIds.has(a.id))
          .map((a) => a.id),
      ),
    [uniqueAccounts, excludedAccountIds],
  );
  const scopeLabel = accountScopeLabel(
    uniqueAccounts.filter((a) => selectedAccountIds.has(a.id)),
    uniqueAccounts.length,
  );

  // One account scope shared by the list, summary and calendar (D8).
  const filteredScheduled = useMemo(
    () => scheduled.filter((s) => selectedAccountIds.has(s.accountId)),
    [scheduled, selectedAccountIds],
  );

  function handleAccountChange(accountId: number, checked: boolean) {
    setExcludedAccountIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }

  function showAllAccounts() {
    setExcludedAccountIds(new Set());
  }

  function openAdd() {
    setEditingId(null);
    setSheetMode("edit");
    setSheetOpen(true);
  }

  function openView(id: number) {
    setEditingId(id);
    setSheetMode("details");
    setSheetOpen(true);
  }

  function openEdit(id: number) {
    setEditingId(id);
    setSheetMode("edit");
    setSheetOpen(true);
  }

  function openRecord(id: number) {
    setRecordingId(id);
    setRecordOpen(true);
  }

  function recordFromDetails(id: number) {
    setSheetOpen(false);
    openRecord(id);
  }

  function skipFromDetails(id: number) {
    setSheetOpen(false);
    setSkippingId(id);
  }

  const skipNext = skipping ? nextDueDateAfter(skipping) : null;
  const skipDescription = skipping
    ? skipNext
      ? `${skipping.payee} due ${formatDate(skipping.nextDueDate!)} moves to ${formatDate(skipNext)}. Nothing is recorded.`
      : `This is the last occurrence of ${skipping.payee}, so skipping it removes the schedule. Nothing is recorded.`
    : "This will move the schedule to its next date.";

  const emptyContent =
    scheduled.length === 0 ? (
      <div className="flex flex-col items-center justify-center gap-4 rounded-md border border-border px-4 py-12 text-center">
        <p className="text-muted-foreground">No subscriptions yet.</p>
        <Button className="min-h-11 md:min-h-8" onClick={openAdd}>
          <PlusIcon />
          Add your first subscription
        </Button>
      </div>
    ) : (
      <div
        data-slot="filter-empty"
        className="flex flex-col items-center justify-center gap-4 rounded-md border border-border px-4 py-12 text-center"
      >
        <p className="text-muted-foreground">
          No subscriptions for {scopeLabel}.
        </p>
        <Button
          variant="outline"
          className="min-h-11 md:min-h-8"
          onClick={showAllAccounts}
        >
          Show all accounts
        </Button>
      </div>
    );

  const title = (
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Manage your recurring bills and upcoming transfers.
      </p>
    </div>
  );

  const addButton = (
    <Button
      onClick={openAdd}
      className="min-h-11 shrink-0 md:min-h-8"
      aria-label="Add subscription"
    >
      <PlusIcon />
      Add<span className="hidden sm:inline"> Subscription</span>
    </Button>
  );

  const filter = (
    <AccountFilter
      accounts={uniqueAccounts}
      selectedAccountIds={selectedAccountIds}
      onAccountChange={handleAccountChange}
      onSelectAll={showAllAccounts}
      scopeLabel={scopeLabel}
    />
  );

  const summary = (
    <ScheduledSummaryCard
      scheduledTransactions={filteredScheduled}
      scopeLabel={scopeLabel}
    />
  );

  const list = (
    <ScheduledList
      scheduledTransactions={filteredScheduled}
      accounts={accounts}
      onView={openView}
      onRecord={openRecord}
      onSkip={setSkippingId}
      onEdit={openEdit}
      onDelete={(id) => remove.mutate(id)}
      emptyContent={emptyContent}
    />
  );

  return (
    <Layout>
      {isDesktop ? (
        <div className="grid h-full min-h-0 grid-cols-[minmax(18rem,1fr)_minmax(0,3fr)]">
          <div className="flex shrink-0 flex-col gap-4 overflow-y-auto bg-sidebar p-4">
            <ScheduledCalendar
              scheduledTransactions={filteredScheduled}
              scopeLabel={scopeLabel}
            />
            {summary}
          </div>

          <div className="min-w-0 overflow-y-auto p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
              {title}
              <div className="flex items-center gap-3">
                {filter}
                {addButton}
              </div>
            </div>
            {list}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            {title}
            {addButton}
          </div>
          {filter}
          {summary}
          <Collapsible open={calendarOpen} onOpenChange={setCalendarOpen}>
            <CollapsibleTrigger
              render={
                <Button
                  variant="outline"
                  className="min-h-11 w-full justify-between md:min-h-8"
                />
              }
            >
              <span className="flex items-center gap-2">
                <CalendarDaysIcon />
                {calendarOpen ? "Hide calendar" : "Show calendar"}
              </span>
              <ChevronDownIcon
                className={calendarOpen ? "rotate-180" : undefined}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <ScheduledCalendar
                scheduledTransactions={filteredScheduled}
                scopeLabel={scopeLabel}
              />
            </CollapsibleContent>
          </Collapsible>
          {list}
        </div>
      )}

      <ScheduledPaymentDialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingId={editingId}
        initialMode={sheetMode}
        onRecord={recordFromDetails}
        onSkip={skipFromDetails}
      />

      <ConfirmDialog
        open={skipping !== null}
        onOpenChange={(open) => !open && setSkippingId(null)}
        title="Skip this payment?"
        description={skipDescription}
        confirmLabel="Skip"
        confirmVariant={skipNext ? "default" : "destructive"}
        onConfirm={() => skipping && skip.mutate(skipping)}
      />

      <RecordPaymentDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        scheduledId={recordingId}
      />
    </Layout>
  );
}
