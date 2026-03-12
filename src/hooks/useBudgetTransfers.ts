import type { BudgetTransfer } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useBudgetTransfers(month: string) {
  const qc = useQueryClient();

  const { data: transfers = [] } = useQuery({
    queryKey: ["budgetTransfers", month],
    queryFn: () => window.api.getBudgetTransfersByMonth(month),
  });

  const create = useMutation({
    mutationFn: (data: Omit<BudgetTransfer, "id" | "createdAt">) =>
      window.api.createBudgetTransfer(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgetTransfers"] }),
  });

  return { transfers, create };
}
