import { getSyncApi } from "@/platform/sync-api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** Re-reads every query after a sync (or Join) wrote rows to this device. */
export function useSyncRefresh() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      getSyncApi().onSyncChange((event) => {
        if (event.appliedRows > 0) void queryClient.invalidateQueries();
      }),
    [queryClient],
  );
}
