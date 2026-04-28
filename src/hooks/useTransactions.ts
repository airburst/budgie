import type { AccountReconciliation, Transaction } from "@/types/electron";
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
    mutationFn: (
      data: Omit<
        Transaction,
        "id" | "createdAt" | "reconciled" | "transferTransactionId"
      >,
    ) => window.api.createTransaction(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<
        Omit<Transaction, "id" | "createdAt" | "transferTransactionId">
      >;
    }) => window.api.updateTransaction(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteTransaction(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const reconcile = useMutation({
    mutationFn: (payload: {
      toReconcile: number[];
      toUnclear: number[];
      checkpoint: Omit<AccountReconciliation, "id" | "createdAt">;
    }) => window.api.reconcileTransactions(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions", accountId] });
      qc.invalidateQueries({ queryKey: ["transactions"], exact: true });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  return { transactions, categories, create, update, remove, reconcile };
}
