import { getSyncApi } from "@/platform/sync-api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** Window event fired after the app's own mutations succeed (a local write). */
export const LOCAL_WRITE_EVENT = "budgie:local-write";

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
  // A local write emits no sync event, so tell the status readers (the header
  // indicator) to re-read: "pending N" then shows without a sync.
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type === "updated" && event.action.type === "success") {
          window.dispatchEvent(new Event(LOCAL_WRITE_EVENT));
        }
      }),
    [queryClient],
  );
}
