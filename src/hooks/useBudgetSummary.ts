import type {
  BudgetAllocation,
  BudgetTransfer,
  Category,
  Envelope,
  EnvelopeCategory,
  ScheduledTransaction,
  Transaction,
} from "@/types/electron";
import { useQuery } from "@tanstack/react-query";
import {
  computeOverspendForMonth,
  computeRollover,
  prevMonth,
  toMonth,
} from "./budget-computations";

type EnvelopeSummary = {
  envelopeId: number;
  name: string;
  assigned: number;
  activity: number;
  transfersIn: number;
  transfersOut: number;
  rolledOver: number;
  available: number;
  underfunded: boolean;
  categoryIds: number[];
};

type BudgetSummary = {
  availableToBudget: number;
  totalIncome: number;
  totalAssigned: number;
  overspendFromPrior: number;
  envelopes: EnvelopeSummary[];
  unbudgetedActivity: number;
  unbudgetedCategories: { categoryId: number; name: string; amount: number }[];
};

export function useBudgetSummary(month: string) {
  const { data: allEnvelopes = [] } = useQuery<Envelope[]>({
    queryKey: ["envelopes", "all"],
    queryFn: () => window.api.getAllEnvelopesIncludingInactive(),
  });
  const envelopes = allEnvelopes.filter((e) => e.active);

  const { data: mappings = [] } = useQuery<EnvelopeCategory[]>({
    queryKey: ["envelopeCategories"],
    queryFn: () => window.api.getEnvelopeCategories(),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => window.api.getCategories(),
  });

  const { data: allAllocations = [] } = useQuery<BudgetAllocation[]>({
    queryKey: ["budgetAllocations", "all"],
    queryFn: () => window.api.getBudgetAllocations(),
  });

  const { data: allTransfers = [] } = useQuery<BudgetTransfer[]>({
    queryKey: ["budgetTransfers", "all"],
    queryFn: () => window.api.getBudgetTransfers(),
  });

  const { data: allTransactions = [] } = useQuery<Transaction[]>({
    queryKey: ["transactions"],
    queryFn: () => window.api.getTransactions(),
  });

  const { data: scheduledTransactions = [] } = useQuery<ScheduledTransaction[]>(
    {
      queryKey: ["scheduledTransactions"],
      queryFn: () => window.api.getScheduledTransactions(),
    },
  );

  // Exclude the receiving side of transfers to avoid double-counting
  const budgetTransactions = allTransactions.filter(
    (t) => !(t.transferTransactionId && t.amount > 0),
  );

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const mappedCategoryIds = new Set(mappings.map((m) => m.categoryId));

  // Income for this month
  const incomeCategories = new Set(
    categories.filter((c) => c.expenseType === "income").map((c) => c.id),
  );
  const totalIncome = budgetTransactions
    .filter(
      (t) =>
        t.categoryId &&
        incomeCategories.has(t.categoryId) &&
        toMonth(t.date) === month,
    )
    .reduce((sum, t) => sum + t.amount, 0);

  // Total assigned this month
  const monthAllocations = allAllocations.filter((a) => a.month === month);
  const totalAssigned = monthAllocations.reduce(
    (sum, a) => sum + a.assigned,
    0,
  );

  // Overspend from prior month
  const prior = prevMonth(month);
  const overspendFromPrior = computeOverspendForMonth(
    allEnvelopes,
    prior,
    allAllocations,
    allTransfers,
    budgetTransactions,
    mappings,
  );

  // ATB
  const availableToBudget = totalIncome - totalAssigned - overspendFromPrior;

  // Per-envelope summaries
  const envelopeSummaries: EnvelopeSummary[] = envelopes.map((env) => {
    const categoryIds = mappings
      .filter((m) => m.envelopeId === env.id)
      .map((m) => m.categoryId);

    const startMonth = toMonth(env.createdAt ?? month);
    const rolledOver = computeRollover(
      env.id,
      month,
      startMonth,
      allAllocations,
      allTransfers,
      budgetTransactions,
      categoryIds,
    );

    const alloc = monthAllocations.find((a) => a.envelopeId === env.id);
    const assigned = alloc?.assigned ?? 0;

    const activity = budgetTransactions
      .filter(
        (t) =>
          t.categoryId &&
          categoryIds.includes(t.categoryId) &&
          toMonth(t.date) === month,
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const transfersIn = allTransfers
      .filter((t) => t.toEnvelopeId === env.id && t.month === month)
      .reduce((sum, t) => sum + t.amount, 0);
    const transfersOut = allTransfers
      .filter((t) => t.fromEnvelopeId === env.id && t.month === month)
      .reduce((sum, t) => sum + t.amount, 0);

    const available =
      rolledOver + assigned + activity + transfersIn - transfersOut;

    const scheduledTotal = scheduledTransactions
      .filter(
        (s) =>
          s.active &&
          s.categoryId &&
          categoryIds.includes(s.categoryId) &&
          s.nextDueDate &&
          toMonth(s.nextDueDate) === month,
      )
      .reduce((sum, s) => sum + Math.abs(s.amount), 0);
    const underfunded = assigned < scheduledTotal;

    return {
      envelopeId: env.id,
      name: env.name,
      assigned,
      activity,
      transfersIn,
      transfersOut,
      rolledOver,
      available,
      underfunded,
      categoryIds,
    };
  });

  // Unbudgeted spending (expenses + transfers, not income)
  const budgetableCategoryIds = new Set(
    categories.filter((c) => c.expenseType !== "income").map((c) => c.id),
  );
  const unbudgetedTxns = budgetTransactions.filter(
    (t) =>
      t.categoryId &&
      budgetableCategoryIds.has(t.categoryId) &&
      !mappedCategoryIds.has(t.categoryId) &&
      toMonth(t.date) === month,
  );
  const unbudgetedActivity = unbudgetedTxns.reduce(
    (sum, t) => sum + t.amount,
    0,
  );

  const unbudgetedByCategory = new Map<number, number>();
  for (const t of unbudgetedTxns) {
    const prev = unbudgetedByCategory.get(t.categoryId!) ?? 0;
    unbudgetedByCategory.set(t.categoryId!, prev + t.amount);
  }
  const unbudgetedCategories = Array.from(unbudgetedByCategory.entries()).map(
    ([categoryId, amount]) => ({
      categoryId,
      name: categoryMap.get(categoryId)?.name ?? "Unknown",
      amount,
    }),
  );

  const summary: BudgetSummary = {
    availableToBudget,
    totalIncome,
    totalAssigned,
    overspendFromPrior,
    envelopes: envelopeSummaries,
    unbudgetedActivity,
    unbudgetedCategories,
  };

  return summary;
}
