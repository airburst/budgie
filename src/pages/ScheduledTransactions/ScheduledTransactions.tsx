import { Button } from "@/components/ui/button";
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import { PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Layout from "../layout";
import { AccountFilter } from "./AccountFilter";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { ScheduledCalendar } from "./ScheduledCalendar";
import { ScheduledPaymentDialog } from "./ScheduledPaymentForm";
import { ScheduledSummaryCard } from "./ScheduledSummaryCard";
import { ScheduledTable } from "./ScheduledTable";

export default function ScheduledTransactions() {
  const { scheduled, accounts, remove } = useScheduledTransactions();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const [focusRecordedAmountOnOpen, setFocusRecordedAmountOnOpen] =
    useState(false);

  // Extract unique accounts from scheduled transactions
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

  // Initialize selected accounts to all unique accounts (all checked by default)
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(
    () => new Set(uniqueAccounts.map((a) => a.id)),
  );

  // Update selected accounts when unique accounts change
  useEffect(() => {
    setSelectedAccountIds(new Set(uniqueAccounts.map((a) => a.id)));
  }, [uniqueAccounts]);

  // Filter scheduled transactions by selected accounts
  const filteredScheduled = useMemo(
    () => scheduled.filter((s) => selectedAccountIds.has(s.accountId)),
    [scheduled, selectedAccountIds],
  );

  function handleAccountChange(accountId: number, checked: boolean) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(accountId);
      } else {
        next.delete(accountId);
      }
      return next;
    });
  }

  function openAdd() {
    setEditingId(null);
    setSheetOpen(true);
  }

  function openEdit(id: number) {
    setEditingId(id);
    setSheetOpen(true);
  }

  function openRecord(id: number, options?: { focusAmount?: boolean }) {
    setRecordingId(id);
    setFocusRecordedAmountOnOpen(!!options?.focusAmount);
    setRecordOpen(true);
  }

  function handleRecordOpenChange(open: boolean) {
    setRecordOpen(open);
    if (!open) setFocusRecordedAmountOnOpen(false);
  }

  return (
    <Layout>
      <div className="grid grid-cols-[minmax(18rem,1fr)_3fr] h-full">
        <div className="shrink-0 bg-sidebar p-4 flex flex-col gap-4 overflow-y-auto">
          <ScheduledCalendar scheduledTransactions={scheduled} />
          <ScheduledSummaryCard scheduledTransactions={scheduled} />
        </div>

        <div className="overflow-y-auto p-4 sm:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Subscriptions
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage your recurring bills and upcoming transfers.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <AccountFilter
                accounts={uniqueAccounts}
                selectedAccountIds={selectedAccountIds}
                onAccountChange={handleAccountChange}
              />
              <Button onClick={openAdd} size="sm">
                <PlusIcon />
                Add Subscription
              </Button>
            </div>
          </div>

          <ScheduledTable
            scheduledTransactions={filteredScheduled}
            accounts={accounts}
            onRecord={openRecord}
            onEdit={openEdit}
            onDelete={(id) => remove.mutate(id)}
          />
        </div>
      </div>

      <ScheduledPaymentDialog
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingId={editingId}
      />

      <RecordPaymentDialog
        open={recordOpen}
        onOpenChange={handleRecordOpenChange}
        scheduledId={recordingId}
        onEdit={openEdit}
        focusAmountOnOpen={focusRecordedAmountOnOpen}
      />
    </Layout>
  );
}
