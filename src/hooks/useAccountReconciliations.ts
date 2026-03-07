import type { AccountReconciliation } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useAccountReconciliations(accountId: number) {
  const qc = useQueryClient();

  const { data: reconciliations = [] } = useQuery({
    queryKey: ["account_reconciliations", accountId],
    queryFn: () => window.api.getAccountReconciliationsByAccount(accountId),
    enabled: !!accountId,
  });

  const create = useMutation({
    mutationFn: (data: Omit<AccountReconciliation, "id" | "createdAt">) =>
      window.api.createAccountReconciliation(data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["account_reconciliations", accountId],
      });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteAccountReconciliation(id),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["account_reconciliations", accountId],
      });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  return { reconciliations, create, remove };
}
