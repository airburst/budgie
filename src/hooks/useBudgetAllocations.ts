import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useBudgetAllocations(month: string) {
  const qc = useQueryClient();

  const { data: allocations = [] } = useQuery({
    queryKey: ["budgetAllocations", month],
    queryFn: () => window.api.getBudgetAllocationsByMonth(month),
  });

  const invalidateAllocations = () =>
    qc.invalidateQueries({ queryKey: ["budgetAllocations"] });

  const upsert = useMutation({
    mutationFn: ({
      envelopeId,
      assigned,
    }: {
      envelopeId: number;
      assigned: number;
    }) => window.api.upsertBudgetAllocation(envelopeId, month, assigned),
    onSuccess: invalidateAllocations,
  });

  const quickFill = useMutation({
    mutationFn: (sourceMonth: string) =>
      window.api.quickFillAllocations(month, sourceMonth),
    onSuccess: invalidateAllocations,
  });

  return { allocations, upsert, quickFill };
}
