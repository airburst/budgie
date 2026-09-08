import { AccountSelect } from "@/components/account-select";
import { ChartCard } from "@/components/chart-card";
import {
  type DateRange,
  DateRangeSelect,
  computeRange,
} from "@/components/date-range-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccounts } from "@/hooks/useAccounts";
import { useReportsData } from "@/hooks/useReportsData";
import Layout from "@/pages/layout";
import { IncomeExpensesChart } from "@/pages/Reports/IncomeExpensesChart";
import { NetWorthChart } from "@/pages/Reports/NetWorthChart";
import { SpendingDonut } from "@/pages/Reports/SpendingDonut";
import { useState } from "react";

const fmt = (v: number) =>
  `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtCompact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `£${(v / 1000).toFixed(1)}k`;
  return fmt(v);
};

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export default function ReportsPage() {
  const [range, setRange] = useState<DateRange>(() => computeRange("90"));
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const { accounts } = useAccounts();
  const data = useReportsData(range.startDate, range.endDate, accountIds);

  const spendingTotal = data.spendingByCategory.reduce(
    (sum, s) => sum + s.amount,
    0,
  );

  const netWorthGrowth =
    data.netWorthOverTime.length >= 2
      ? data.netWorthOverTime[data.netWorthOverTime.length - 1]!.netWorth -
        data.netWorthOverTime[0]!.netWorth
      : 0;

  return (
    <Layout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Reports</h1>
          <div className="flex items-center gap-2">
            <DateRangeSelect value={range.preset} onChange={setRange} />
            <AccountSelect
              accounts={accounts}
              selectedIds={accountIds}
              onChange={setAccountIds}
            />
          </div>
        </div>

        {data.isLoading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <ChartCard title="Spending by Category">
                {data.spendingByCategory.length > 0 ? (
                  <SpendingDonut
                    slices={data.spendingByCategory}
                    total={fmt(spendingTotal)}
                    formatAmount={fmt}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-12">
                    No spending data for this period
                  </p>
                )}
              </ChartCard>

              <ChartCard title="Income vs Expenses">
                {data.incomeVsExpenses.length > 0 ? (
                  <IncomeExpensesChart
                    data={data.incomeVsExpenses}
                    formatMonth={formatMonth}
                    formatAmount={fmt}
                    formatAxisAmount={fmtCompact}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-12">
                    No transaction data for this period
                  </p>
                )}
              </ChartCard>
            </div>

            <ChartCard
              title="Net Worth Trend"
              badge={
                netWorthGrowth !== 0 ? (
                  <span
                    className={`text-xs font-medium ${netWorthGrowth >= 0 ? "text-green-600" : "text-destructive"}`}
                  >
                    {netWorthGrowth >= 0 ? "+" : ""}
                    {fmtCompact(netWorthGrowth)}
                  </span>
                ) : undefined
              }
            >
              {data.netWorthOverTime.length > 0 ? (
                <NetWorthChart
                  data={data.netWorthOverTime}
                  formatMonth={formatMonth}
                  formatAmount={fmt}
                  formatAxisAmount={fmtCompact}
                />
              ) : (
                <p className="text-muted-foreground text-sm text-center py-12">
                  No net worth data for this period
                </p>
              )}
            </ChartCard>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total Assets"
                value={fmt(data.stats.totalAssets)}
              />
              <StatCard label="Total Debt" value={fmt(data.stats.totalDebt)} />
              <StatCard
                label="Monthly Surplus"
                value={fmt(data.stats.monthlySurplus)}
                className={
                  data.stats.monthlySurplus < 0 ? "text-destructive" : ""
                }
              />
              <StatCard
                label="Saving Rate"
                value={`${data.stats.savingRate.toFixed(0)}%`}
              />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-muted-foreground text-xs font-medium">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-semibold ${className ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
