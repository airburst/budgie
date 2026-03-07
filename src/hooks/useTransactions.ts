import type { Transaction } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCategories } from "./useCategories";

export function useTransactions(accountId: number) {
  const qc = useQueryClient();

  const { data: transactions = [] } = useQuery({
    queryKey: ["transactions", accountId],
    queryFn: () => window.api.getTransactionsByAccount(accountId),
    enabled: !!accountId,
  });

  const { categories } = useCategories();

  const create = useMutation({
    mutationFn: (data: Omit<Transaction, "id" | "createdAt">) =>
      window.api.createTransaction(data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["transactions", accountId] }),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<Omit<Transaction, "id" | "createdAt">>;
    }) => window.api.updateTransaction(id, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["transactions", accountId] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteTransaction(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["transactions", accountId] }),
  });

  return { transactions, categories, create, update, remove };
}
