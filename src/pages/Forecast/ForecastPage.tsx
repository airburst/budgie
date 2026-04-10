import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Page header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate(-1)}
            aria-label="Go back"
          >
            <ArrowLeftIcon />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {account?.name ?? "—"}
            </h1>
            {account?.number && (
              <p className="text-sm text-muted-foreground">{account.number}</p>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="px-4 py-4 shrink-0">
          <ForecastChart chartData={chartData} />
        </div>

        {/* Transaction list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-20">
          <ForecastTransactionList
            rows={rowsWithBalance}
            categoryMap={categoryMap}
            onToggleRow={toggleRow}
          />
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-between gap-3 px-4 py-3 border-t bg-background">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setHelpOpen(true)}
          aria-label="Help"
        >
          <HelpCircleIcon />
        </Button>
        <div className="flex items-center gap-3">
          <DatePicker
            value={draftEndDate}
            onChange={setDraftEndDate}
            placeholder="End date"
            className="w-40"
          />
          <Button onClick={handleRefresh} size="sm">
            <RefreshCwIcon />
            Refresh
          </Button>
        </div>
      </div>

      {/* Help dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forecast Help</DialogTitle>
            <DialogDescription>
              How to use the balance forecast.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm space-y-3">
            <p>
              The forecast projects your account balance from today to the
              chosen end date.
            </p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>
                <strong className="text-foreground">Green line</strong> —
                projected running balance over time.
              </li>
              <li>
                <strong className="text-foreground">Red dashed line</strong> —
                zero balance reference; dips below indicate a negative balance.
              </li>
              <li>
                <strong className="text-foreground">Italic rows</strong> —
                projected transactions from your scheduled payments.
              </li>
              <li>
                <strong className="text-foreground">Include checkbox</strong> —
                uncheck any row to exclude it from the forecast calculation.
              </li>
              <li>
                <strong className="text-foreground">Refresh</strong> — apply a
                new end date and reset all inclusions.
              </li>
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
