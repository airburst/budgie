import type { Envelope } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useEnvelopes() {
  const qc = useQueryClient();

  const { data: envelopes = [] } = useQuery({
    queryKey: ["envelopes"],
    queryFn: () => window.api.getEnvelopes(),
  });

  const create = useMutation({
    mutationFn: (data: Omit<Envelope, "id" | "createdAt">) =>
      window.api.createEnvelope(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopes"] }),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<Omit<Envelope, "id" | "createdAt">>;
    }) => window.api.updateEnvelope(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopes"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteEnvelope(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopes"] }),
  });

  return { envelopes, create, update, remove };
}
