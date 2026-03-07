import type { Account } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useAccounts() {
  const qc = useQueryClient();

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => window.api.getAccounts(),
  });

  const create = useMutation({
    mutationFn: (data: Omit<Account, "id" | "createdAt">) =>
      window.api.createAccount(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<Omit<Account, "id" | "createdAt">>;
    }) => window.api.updateAccount(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });

  return { accounts, create, update, remove };
}
