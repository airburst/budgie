import { getSyncApi } from "@/platform/sync-api";
import type { SyncStatusView } from "@/services/sync/api-types";
import { useCallback, useEffect, useState } from "react";

/**
 * The live sync status: read once, then kept current by `onSyncChange`.
 * `null` until the first read. Reading never contacts the sync server.
 */
export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatusView | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getSyncApi().getSyncStatus());
    } catch (error) {
      console.error("Failed to read sync status", error);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return getSyncApi().onSyncChange((event) => setStatus(event.status));
  }, [refresh]);

  return { status, refresh };
}
