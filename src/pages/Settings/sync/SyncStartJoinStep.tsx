import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { getSyncApi } from "@/platform/sync-api";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DownloadBackupButton } from "./DownloadBackupButton";
import { describeSyncFailure } from "./sync-messages";

/**
 * Enrolled, but Start or Join has not run. `hasData` comes from enrol: false
 * offers Start, true offers Join. It is null after a reload, when the answer
 * is not known: "Continue" tries Start and learns it from the refusal.
 */
export function SyncStartJoinStep({
  hasData,
  onHasData,
}: {
  hasData: boolean | null;
  onHasData: (hasData: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmJoin, setConfirmJoin] = useState(false);
  const [offerForce, setOfferForce] = useState(false);

  /** A way out of the half-set-up state: sign this device out again. */
  async function cancel(force: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await getSyncApi().signOutSync(
        force ? { force: true } : undefined,
      );
      if (!result.ok) {
        if (result.reason === "offline") setOfferForce(true);
        setError(describeSyncFailure(result));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign out failed");
    } finally {
      setBusy(false);
    }
  }

  const cancelButton = (
    <Button
      variant="outline"
      className="w-full min-h-11 sm:w-auto md:min-h-0"
      disabled={busy}
      onClick={() => void cancel(false)}
    >
      Cancel
    </Button>
  );

  const forceBlock = offerForce && (
    <div className="space-y-2" data-testid="sync-cancel-offline">
      <p className="text-sm text-muted-foreground">
        Budgie could not reach the sync server to remove this device. You can
        cancel on this device only, then remove this device from the device
        list on another of your devices later.
      </p>
      <Button
        variant="destructive"
        className="w-full min-h-11 sm:w-auto md:min-h-0"
        disabled={busy}
        onClick={() => void cancel(true)}
      >
        Cancel on this device only
      </Button>
    </div>
  );

  async function run(action: "start" | "join") {
    setBusy(true);
    setError(null);
    try {
      const api = getSyncApi();
      const result =
        action === "start" ? await api.startSync() : await api.joinSync();
      if (result.ok) {
        if (action === "join") void queryClient.invalidateQueries();
      } else if (result.reason === "server_has_data") {
        onHasData(true);
      } else if (result.reason === "server_empty") {
        onHasData(false);
      } else {
        setError(describeSyncFailure(result));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  const errorText = error && (
    <p role="alert" className="text-sm text-destructive break-words">
      {error}
    </p>
  );

  if (hasData === true) {
    return (
      <div className="space-y-4" data-testid="sync-join">
        <h3 className="text-base font-semibold">Join your synced data</h3>
        <p className="text-sm text-muted-foreground">
          This device is connected. The cloud already holds budget data.
        </p>
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          Joining replaces all the data on this device with the cloud copy. If
          you want to keep what is on this device, download a backup first. Changes on this device that have not yet reached
          the cloud will be lost, including after being signed out or removed
          and connecting again.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <DownloadBackupButton />
          <Button
            variant="destructive"
            className="w-full min-h-11 sm:w-auto md:min-h-0"
            disabled={busy}
            onClick={() => setConfirmJoin(true)}
          >
            {busy ? "Joining…" : "Join and replace this device's data"}
          </Button>
          {cancelButton}
        </div>
        {forceBlock}
        {errorText}
        <ConfirmDialog
          open={confirmJoin}
          onOpenChange={setConfirmJoin}
          title="Replace this device's data?"
          description="All the budget data on this device will be replaced with the cloud copy. This cannot be undone. Download a backup first if you need one."
          confirmLabel="Replace and join"
          onConfirm={() => void run("join")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="sync-start">
      <h3 className="text-base font-semibold">
        {hasData === false ? "Start syncing" : "Finish setting up"}
      </h3>
      <p className="text-sm text-muted-foreground">
        {hasData === false
          ? "This device is connected and the cloud is empty. Start will upload all of your budget data."
          : "This device is connected. Continue to finish turning on sync."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="w-full min-h-11 sm:w-auto md:min-h-0"
          disabled={busy}
          onClick={() => void run("start")}
        >
          {busy ? "Starting…" : hasData === false ? "Start sync" : "Continue"}
        </Button>
        {cancelButton}
      </div>
      {forceBlock}
      {errorText}
    </div>
  );
}
