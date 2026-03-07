import type { Category } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useCategories() {
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => window.api.getCategories(),
  });

  const create = useMutation({
    mutationFn: (data: Omit<Category, "id" | "createdAt">) =>
      window.api.createCategory(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<Omit<Category, "id" | "createdAt">>;
    }) => window.api.updateCategory(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  return { categories, create, update, remove };
}
