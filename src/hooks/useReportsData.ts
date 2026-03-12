import type { AccountWithBalances, Category, Transaction } from "@/types/electron";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

type SpendingByCategory = {
  categoryId: number;
  name: string;
  amount: number;
  fill: string;
};

type IncomeVsExpense = {
  month: string;
  income: number;
  expenses: number;
};

type NetWorthPoint = {
  month: string;
  netWorth: number;
};

type Stats = {
  totalAssets: number;
  totalDebt: number;
  monthlySurplus: number;
  savingRate: number;
};

export type ReportsData = {
  spendingByCategory: SpendingByCategory[];
  incomeVsExpenses: IncomeVsExpense[];
  netWorthOverTime: NetWorthPoint[];
  stats: Stats;
  isLoading: boolean;
};

const COLORS = [
  "hsl(220, 70%, 55%)",
  "hsl(340, 65%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(40, 80%, 55%)",
  "hsl(280, 55%, 55%)",
  "hsl(200, 75%, 50%)",
  "hsl(15, 70%, 50%)",
  "hsl(100, 50%, 45%)",
];

function toMonth(date: string): string {
  return date.slice(0, 7);
}

const ASSET_TYPES = new Set(["bank", "investment", "cash"]);
const LIABILITY_TYPES = new Set(["credit_card", "loan"]);

export function useReportsData(
  startDate: string,
  endDate: string,
  accountIds: number[],
): ReportsData {
  const { data: transactions = [], isLoading: txLoading } = useQuery<
    Transaction[]
  >({
    queryKey: ["transactions", "dateRange", startDate, endDate, accountIds],
    queryFn: () =>
      window.api.getTransactionsByDateRange(
        startDate,
        endDate,
        accountIds.length > 0 ? accountIds : undefined,
      ),
  });

  const { data: categories = [], isLoading: catLoading } = useQuery<
    Category[]
  >({
    queryKey: ["categories"],
    queryFn: () => window.api.getCategories(),
  });

  const { data: accounts = [], isLoading: accLoading } = useQuery<
    AccountWithBalances[]
  >({
    queryKey: ["accounts"],
    queryFn: () => window.api.getAccounts(),
  });

  const isLoading = txLoading || catLoading || accLoading;

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const result = useMemo(() => {
    // Filter out transfers
    const transferCategoryIds = new Set(
      categories
        .filter((c) => c.expenseType === "transfer")
        .map((c) => c.id),
    );

    const nonTransferTxns = transactions.filter(
      (t) => !t.categoryId || !transferCategoryIds.has(t.categoryId),
    );

    // Spending by category (top 5 + Other)
    const expenseByCat = new Map<number, number>();
    for (const t of nonTransferTxns) {
      if (!t.categoryId) continue;
      const cat = categoryMap.get(t.categoryId);
      if (!cat || cat.expenseType !== "expense") continue;
      const prev = expenseByCat.get(t.categoryId) ?? 0;
      expenseByCat.set(t.categoryId, prev + Math.abs(t.amount));
    }
    const sorted = [...expenseByCat.entries()].sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5);
    const otherTotal = sorted.slice(5).reduce((sum, [, v]) => sum + v, 0);

    const spendingByCategory: SpendingByCategory[] = top5.map(
      ([catId, amount], i) => ({
        categoryId: catId,
        name: categoryMap.get(catId)?.name ?? "Unknown",
        amount,
        fill: COLORS[i % COLORS.length]!,
      }),
    );
    if (otherTotal > 0) {
      spendingByCategory.push({
        categoryId: -1,
        name: "Other",
        amount: otherTotal,
        fill: COLORS[5 % COLORS.length]!,
      });
    }

    // Income vs Expenses by month
    const monthlyData = new Map<
      string,
      { income: number; expenses: number }
    >();
    for (const t of nonTransferTxns) {
      const m = toMonth(t.date);
      const entry = monthlyData.get(m) ?? { income: 0, expenses: 0 };
      if (t.categoryId) {
        const cat = categoryMap.get(t.categoryId);
        if (cat?.expenseType === "income") {
          entry.income += t.amount;
        } else if (cat?.expenseType === "expense") {
          entry.expenses += Math.abs(t.amount);
        }
      }
      monthlyData.set(m, entry);
    }
    const incomeVsExpenses: IncomeVsExpense[] = [...monthlyData.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    // Net worth over time
    const filteredAccounts =
      accountIds.length > 0
        ? accounts.filter((a) => accountIds.includes(a.id))
        : accounts;

    const currentNetWorth = filteredAccounts.reduce((sum, a) => {
      if (ASSET_TYPES.has(a.type)) return sum + a.computedBalance;
      if (LIABILITY_TYPES.has(a.type)) return sum + a.computedBalance;
      return sum;
    }, 0);

    // Work backwards from current net worth using all transactions (not just filtered date range)
    // For simplicity, compute net worth at each month-end in the date range
    const allMonths = [...monthlyData.keys()].sort();
    const netWorthOverTime: NetWorthPoint[] = [];

    if (allMonths.length > 0) {
      // Sum all transactions after each month to subtract from current
      let running = currentNetWorth;
      // Get all months' net transaction amounts in reverse
      const monthsReversed = [...allMonths].reverse();
      const netByMonth = new Map<string, number>();
      for (const t of nonTransferTxns) {
        const m = toMonth(t.date);
        netByMonth.set(m, (netByMonth.get(m) ?? 0) + t.amount);
      }

      // Build from latest month backward
      for (const m of monthsReversed) {
        netWorthOverTime.unshift({ month: m, netWorth: running });
        running -= netByMonth.get(m) ?? 0;
      }
    }

    // Stats
    const totalAssets = filteredAccounts
      .filter((a) => ASSET_TYPES.has(a.type))
      .reduce((sum, a) => sum + a.computedBalance, 0);

    const totalDebt = filteredAccounts
      .filter((a) => LIABILITY_TYPES.has(a.type))
      .reduce((sum, a) => sum + Math.abs(a.computedBalance), 0);

    // Most recent complete month
    const now = new Date();
    const lastCompleteMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;
    const recentMonth =
      incomeVsExpenses.findLast((m) => m.month <= lastCompleteMonth) ??
      incomeVsExpenses[incomeVsExpenses.length - 1];

    const monthlySurplus = recentMonth
      ? recentMonth.income - recentMonth.expenses
      : 0;
    const savingRate =
      recentMonth && recentMonth.income > 0
        ? (monthlySurplus / recentMonth.income) * 100
        : 0;

    return {
      spendingByCategory,
      incomeVsExpenses,
      netWorthOverTime,
      stats: { totalAssets, totalDebt, monthlySurplus, savingRate },
      isLoading,
    };
  }, [
    transactions,
    categories,
    accounts,
    categoryMap,
    accountIds,
    isLoading,
  ]);

  return result;
}
