import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccounts } from "@/hooks/useAccounts";
import { useScheduledTransactions } from "@/hooks/useScheduledTransactions";
import { useTransactions } from "@/hooks/useTransactions";
import { buildForecastRows } from "@/lib/forecast";
import type { ForecastRow } from "@/lib/forecast";
import { formatDate } from "@/lib/utils";
import { addMonths, format } from "date-fns";
import { ArrowLeftIcon, HelpCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import Layout from "../layout";

type ChartPoint = {
  date: string;
  balance: number;
};

const chartConfig = {
  balance: {
    label: "Balance",
    color: "#22c55e",
  },
} satisfies ChartConfig;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export default function ForecastPage() {
  const { id } = useParams<{ id: string }>();
  const accountId = Number(id);
  const navigate = useNavigate();

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultEndDate = format(addMonths(new Date(), 3), "yyyy-MM-dd");

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

  const rows = useMemo(
    () => buildForecastRows(transactions, scheduled, accountId, today, endDate),
    [transactions, scheduled, accountId, today, endDate],
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
      <div className="flex flex-col h-full overflow-y-auto pb-20">
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
        <div className="px-4 py-4">
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <LineChart
              data={chartData}
              margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value: string) => {
                  const [y, m, d] = value.split("-");
                  return format(
                    new Date(Number(y), Number(m) - 1, Number(d)),
                    "dd MMM",
                  );
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                width={64}
                tickFormatter={formatCurrency}
              />
              <ChartTooltip
                cursor={false}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const value = payload[0]?.value as number | undefined;
                  const [y, m, d] = (label as string).split("-");
                  const dateLabel = format(
                    new Date(Number(y), Number(m) - 1, Number(d)),
                    "d MMMM yyyy",
                  );
                  return (
                    <div className="grid min-w-36 items-start gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <span className="font-medium">{dateLabel}</span>
                      {value !== undefined && (
                        <span className="font-mono tabular-nums">
                          {value.toLocaleString("en-GB", {
                            style: "currency",
                            currency: "GBP",
                          })}
                        </span>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={0}
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <Line
                dataKey="balance"
                type="linear"
                stroke="var(--color-balance)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </div>

        {/* Transaction list */}
        <div className="px-4">
          <div className="border border-border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-accent">Date</TableHead>
                  <TableHead className="bg-accent">Payee</TableHead>
                  <TableHead className="text-right bg-accent">
                    Withdrawal
                  </TableHead>
                  <TableHead className="text-right bg-accent">
                    Deposit
                  </TableHead>
                  <TableHead className="bg-accent">Category</TableHead>
                  <TableHead className="bg-accent">Memo</TableHead>
                  <TableHead className="text-right bg-accent">
                    Balance
                  </TableHead>
                  <TableHead className="text-center bg-accent">
                    Include
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowsWithBalance.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-12"
                    >
                      No projected transactions in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  rowsWithBalance.map((row) => {
                    const category = row.categoryId
                      ? categoryMap.get(row.categoryId)
                      : null;
                    return (
                      <TableRow
                        key={row.key}
                        className={
                          row.isScheduled
                            ? "text-muted-foreground italic"
                            : undefined
                        }
                      >
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell>{row.payee}</TableCell>
                        <TableCell className="text-right">
                          {row.amount < 0 ? (
                            <Amount value={row.amount} />
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.amount > 0 ? (
                            <Amount value={row.amount} />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {category ? (
                            <Badge variant="secondary">{category.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                          {row.notes ?? ""}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.included ? (
                            <Amount value={row.runningBalance} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={row.included}
                            onChange={() => toggleRow(row.key)}
                            className="cursor-pointer accent-blue-500 size-4"
                            aria-label="Include in forecast"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
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
