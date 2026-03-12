import type { EnvelopeCategory } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useEnvelopeCategories() {
  const qc = useQueryClient();

  const { data: mappings = [] } = useQuery({
    queryKey: ["envelopeCategories"],
    queryFn: () => window.api.getEnvelopeCategories(),
  });

  const create = useMutation({
    mutationFn: (data: Omit<EnvelopeCategory, "id">) =>
      window.api.createEnvelopeCategory(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopeCategories"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteEnvelopeCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopeCategories"] }),
  });

  const removeByEnvelope = useMutation({
    mutationFn: (envelopeId: number) =>
      window.api.deleteEnvelopeCategoriesByEnvelope(envelopeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopeCategories"] }),
  });

  return { mappings, create, remove, removeByEnvelope };
}
