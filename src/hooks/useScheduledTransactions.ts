import type { ScheduledTransaction } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccounts } from "./useAccounts";
import { useCategories } from "./useCategories";

export function useScheduledTransactions() {
  const qc = useQueryClient();

  const { data: scheduled = [] } = useQuery({
    queryKey: ["scheduled_transactions"],
    queryFn: () => window.api.getScheduledTransactions(),
  });

  const { accounts } = useAccounts();
  const { categories } = useCategories();

  const create = useMutation({
    mutationFn: (data: Omit<ScheduledTransaction, "id" | "createdAt">) =>
      window.api.createScheduledTransaction(data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["scheduled_transactions"] }),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<Omit<ScheduledTransaction, "id" | "createdAt">>;
    }) => window.api.updateScheduledTransaction(id, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["scheduled_transactions"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteScheduledTransaction(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["scheduled_transactions"] }),
  });

  return { scheduled, accounts, categories, create, update, remove };
}
