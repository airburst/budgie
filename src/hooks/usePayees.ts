import type { Payee } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function usePayees() {
  const qc = useQueryClient();

  const { data: payees = [] } = useQuery({
    queryKey: ["payees"],
    queryFn: () => window.api.getPayees(),
  });

  const create = useMutation({
    mutationFn: (data: Omit<Payee, "id" | "createdAt">) =>
      window.api.createPayee(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payees"] }),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<Omit<Payee, "id" | "createdAt">>;
    }) => window.api.updatePayee(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payees"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deletePayee(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payees"] }),
  });

  const upsert = useMutation({
    mutationFn: ({
      name,
      categoryId,
      amount,
    }: {
      name: string;
      categoryId: number | null;
      amount: number | null;
    }) => window.api.upsertPayee(name, categoryId, amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payees"] }),
  });

  return { payees, create, update, remove, upsert };
}
