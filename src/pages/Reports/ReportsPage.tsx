import { AccountSelect } from "@/components/account-select";
import { ChartCard } from "@/components/chart-card";
import {
  type DateRange,
  DateRangeSelect,
  computeRange,
} from "@/components/date-range-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useAccounts } from "@/hooks/useAccounts";
import { useReportsData } from "@/hooks/useReportsData";
import Layout from "@/pages/layout";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

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

const incExpConfig: ChartConfig = {
  income: { label: "Income", color: "hsl(160, 60%, 45%)" },
  expenses: { label: "Expenses", color: "hsl(0, 70%, 60%)" },
};

const netWorthConfig: ChartConfig = {
  netWorth: { label: "Net Worth", color: "hsl(220, 70%, 55%)" },
};

export default function ReportsPage() {
  const [range, setRange] = useState<DateRange>(() => computeRange("90"));
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const { accounts } = useAccounts();
  const data = useReportsData(range.startDate, range.endDate, accountIds);

  const spendingConfig: ChartConfig = Object.fromEntries(
    data.spendingByCategory.map((s) => [
      s.name,
      { label: s.name, color: s.fill },
    ]),
  );

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
                  <ChartContainer
                    config={spendingConfig}
                    className="aspect-square max-h-[300px]"
                  >
                    <PieChart>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) => fmt(value as number)}
                          />
                        }
                      />
                      <Pie
                        data={data.spendingByCategory}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius="50%"
                        outerRadius="80%"
                        paddingAngle={2}
                      >
                        {data.spendingByCategory.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Legend />
                      <text
                        x="50%"
                        y="50%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-foreground text-lg font-semibold"
                      >
                        {fmt(spendingTotal)}
                      </text>
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-12">
                    No spending data for this period
                  </p>
                )}
              </ChartCard>

              <ChartCard title="Income vs Expenses">
                {data.incomeVsExpenses.length > 0 ? (
                  <ChartContainer
                    config={incExpConfig}
                    className="aspect-video max-h-[300px]"
                  >
                    <BarChart data={data.incomeVsExpenses}>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="month"
                        tickFormatter={formatMonth}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tickFormatter={fmtCompact}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(label) =>
                              formatMonth(label as string)
                            }
                            formatter={(value) => fmt(value as number)}
                          />
                        }
                      />
                      <Legend />
                      <Bar
                        dataKey="income"
                        fill="var(--color-income)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="expenses"
                        fill="var(--color-expenses)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
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
                <ChartContainer
                  config={netWorthConfig}
                  className="aspect-[3/1] max-h-[250px]"
                >
                  <AreaChart data={data.netWorthOverTime}>
                    <defs>
                      <linearGradient
                        id="netWorthGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="var(--color-netWorth)"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-netWorth)"
                          stopOpacity={0.05}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={formatMonth}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={fmtCompact}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) =>
                            formatMonth(label as string)
                          }
                          formatter={(value) => fmt(value as number)}
                        />
                      }
                    />
                    <Area
                      dataKey="netWorth"
                      type="monotone"
                      stroke="var(--color-netWorth)"
                      fill="url(#netWorthGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ChartContainer>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-12">
                  No net worth data for this period
                </p>
              )}
            </ChartCard>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Assets" value={fmt(data.stats.totalAssets)} />
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
