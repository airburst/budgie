import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { useAccounts } from "@/hooks/useAccounts";
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import { useTransactions } from "@/hooks/useTransactions";
import { buildForecastRows } from "@/lib/forecast";
import { addMonths, endOfMonth, format } from "date-fns";
import { ArrowLeftIcon, HelpCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import Layout from "../layout";
import { ForecastChart, type ChartPoint } from "./ForecastChart";
import { ForecastDetails } from "./ForecastDetails";
import { ForecastHelp } from "./ForecastHelp";
import { ForecastTransactionList } from "./ForecastTransactionList";

export default function ForecastPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = Number(id);
  const navigate = useNavigate();

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultEndDate = format(
    endOfMonth(addMonths(new Date(), 3)),
    "yyyy-MM-dd",
  );

  const [endDate, setEndDate] = useState(defaultEndDate);
  const [draftEndDate, setDraftEndDate] = useState(defaultEndDate);
  const [exclusions, setExclusions] = useState<Set<string>>(new Set());
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);

  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.id === accountId);

  const { transactions, categories } = useTransactions(accountId);
  const { scheduled } = useScheduledTransactions();

  const baseBalance = useMemo(() => {
    const opening = account?.balance ?? 0;
    const posted = transactions
      .filter((t) => t.date <= today)
      .reduce((sum, t) => sum + t.amount, 0);
    return opening + posted;
  }, [account, transactions, today]);

  // Resolve missing transferToAccountId from the transfer-category naming convention
  // (Transfer sub-category name == destination account name) so that existing
  // scheduled transfers — created before the explicit column was added — still
  // appear as incoming on the receiving account's forecast.
  const resolvedScheduled = useMemo(() => {
    const accountByName = new Map(accounts.map((a) => [a.name, a.id]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    return scheduled.map((s) => {
      if (s.transferToAccountId != null || s.categoryId == null) return s;
      const cat = categoryById.get(s.categoryId);
      if (cat?.expenseType === "transfer" && cat.parentId != null) {
        const destId = accountByName.get(cat.name) ?? null;
        if (destId != null) return { ...s, transferToAccountId: destId };
      }
      return s;
    });
  }, [scheduled, accounts, categories]);

  const rows = useMemo(
    () =>
      buildForecastRows(
        transactions,
        resolvedScheduled,
        accountId,
        today,
        endDate,
      ),
    [transactions, resolvedScheduled, accountId, today, endDate],
  );

  // Reset exclusions when the row set changes (new end date / fresh data)
  useEffect(() => {
    setExclusions(new Set());
  }, [rows]);

  function toggleRow(key: string) {
    setExclusions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleRefresh() {
    setEndDate(draftEndDate);
    setExclusions(new Set());
  }

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const { rowsWithBalance, chartData } = useMemo(() => {
    let balance = baseBalance;
    const dateBalanceMap = new Map<string, number>();

    const withBalance = rows.map((row) => {
      const included = !exclusions.has(row.key);
      if (included) balance += row.amount;
      dateBalanceMap.set(row.date, balance);
      return { ...row, included, runningBalance: balance };
    });

    const points: ChartPoint[] = [{ date: today, balance: baseBalance }];
    for (const [date, bal] of dateBalanceMap) {
      if (date !== today) {
        points.push({ date, balance: bal });
      }
    }
    if (!dateBalanceMap.has(endDate) && endDate !== today) {
      points.push({ date: endDate, balance });
    }
    points.sort((a, b) => a.date.localeCompare(b.date));

    return { rowsWithBalance: withBalance, chartData: points };
  }, [rows, exclusions, baseBalance, today, endDate]);

  const detailsRow = rowsWithBalance.find((r) => r.key === detailsKey) ?? null;

  return (
    <Layout>
      {/* One page scroller (the main region). The controls bar is sticky at the
          end of the content, so it reserves real layout space, wraps instead of
          forcing width and never stacks with another fixed footer. */}
      <div className="flex min-h-full flex-col">
        <div className="flex-1">
          {/* Page header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate(-1)}
              aria-label="Go back"
            >
              <ArrowLeftIcon />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight break-words sm:text-2xl">
                {account?.name ?? "—"}
              </h1>
              {account?.number && (
                <p className="text-sm text-muted-foreground">
                  {account.number}
                </p>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="px-4 py-4">
            <ForecastChart chartData={chartData} />
          </div>

          {/* Transaction list */}
          <div className="px-4 pb-4">
            <ForecastTransactionList
              rows={rowsWithBalance}
              categoryMap={categoryMap}
              onToggleRow={toggleRow}
              onShowDetails={setDetailsKey}
            />
          </div>
        </div>

        {/* Controls */}
        <div
          role="group"
          aria-label="Forecast controls"
          data-slot="forecast-controls"
          className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setHelpOpen(true)}
            aria-label="Help"
          >
            <HelpCircleIcon />
          </Button>
          <div className="min-w-0 flex-1 basis-30 sm:ml-auto sm:flex-none sm:basis-auto">
            <DatePicker
              value={draftEndDate}
              onChange={setDraftEndDate}
              placeholder="End date"
              className="sm:w-40"
            />
          </div>
          <Button onClick={handleRefresh}>
            <RefreshCwIcon />
            Refresh
          </Button>
        </div>
      </div>

      <ForecastDetails
        row={detailsRow}
        category={
          detailsRow?.categoryId
            ? categoryMap.get(detailsRow.categoryId)
            : undefined
        }
        onClose={() => setDetailsKey(null)}
      />
      <ForecastHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </Layout>
  );
}
