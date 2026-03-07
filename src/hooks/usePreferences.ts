import type { Preferences } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const DEFAULT_PREFERENCES: Preferences = {
  hideReconciled: true,
  hideCleared: false,
};

export function usePreferences() {
  const qc = useQueryClient();

  const { data: preferences = DEFAULT_PREFERENCES } = useQuery({
    queryKey: ["preferences"],
    queryFn: () => window.api.getPreferences(),
  });

  const update = useMutation({
    mutationFn: (prefs: Preferences) => window.api.setPreferences(prefs),
    onMutate: async (newPrefs) => {
      await qc.cancelQueries({ queryKey: ["preferences"] });
      const previous = qc.getQueryData<Preferences>(["preferences"]);
      qc.setQueryData(["preferences"], newPrefs);
      return { previous };
    },
    onError: (_err, _prefs, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(["preferences"], context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["preferences"] });
    },
  });

  return { preferences, update };
}
