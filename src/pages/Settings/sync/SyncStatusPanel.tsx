import { Button } from "@/components/ui/button";
import { getSyncApi } from "@/platform/sync-api";
import type { SyncStatusView } from "@/services/sync/api-types";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { DownloadBackupButton } from "./DownloadBackupButton";
import { SyncDangerZone } from "./SyncDangerZone";
import { SyncDevices } from "./SyncDevices";
import {
  describeSyncFailure,
  formatSyncTime,
  syncStateLabel,
} from "./sync-messages";

function StatusRow({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm"
      data-testid={testId}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{children}</dd>
    </div>
  );
}

/**
 * Sync is set up on this device: its state and "Sync now". Later stories add
 * their blocks below (devices SY-040, disable / sign out / delete SY-041,
 * backup SY-042) as siblings of the status list.
 */
export function SyncStatusPanel({ status }: { status: SyncStatusView }) {
  const [syncing, setSyncing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function handleSyncNow() {
    setSyncing(true);
    setFailure(null);
    try {
      const result = await getSyncApi().syncNow();
      if (!result.ok) setFailure(describeSyncFailure(result));
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="sync-status-panel">
      <dl className="space-y-2">
        <StatusRow label="Status" testId="sync-state">
          {syncStateLabel(status.state)}
        </StatusRow>
        <StatusRow label="Last synced" testId="sync-last-synced">
          {formatSyncTime(status.lastSyncedAt)}
        </StatusRow>
        <StatusRow label="Pending changes" testId="sync-pending">
          {status.pendingCount}
        </StatusRow>
        <StatusRow label="Last error" testId="sync-last-error">
          {status.lastError
            ? `${status.lastError.message} (${formatSyncTime(status.lastError.at)})`
            : "None"}
        </StatusRow>
      </dl>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          className="w-full min-h-11 sm:w-auto md:min-h-0"
          onClick={() => void handleSyncNow()}
          disabled={syncing}
          aria-busy={syncing}
        >
          {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
        {syncing && (
          <span role="status" className="text-sm text-muted-foreground">
            Syncing with the cloud
          </span>
        )}
      </div>
      {failure && (
        <p role="alert" className="text-sm text-destructive break-words">
          {failure}
        </p>
      )}
      <SyncDevices />
      <SyncDangerZone status={status} />
      <DownloadBackupButton />
    </div>
  );
}
