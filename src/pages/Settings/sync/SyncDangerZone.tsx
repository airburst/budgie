import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  ResponsiveOverlay,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSyncApi } from "@/platform/sync-api";
import type { SyncFailure, SyncStatusView } from "@/services/sync/api-types";
import { useId, useState } from "react";
import { describeSyncFailure } from "./sync-messages";

const DEFAULT_RETENTION_DAYS = 7;

function StopAction({
  testId,
  title,
  keeps,
  removes,
  children,
}: {
  testId: string;
  title: string;
  keeps: string;
  removes: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Keeps:</span> {keeps}
      </p>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Removes:</span> {removes}
      </p>
      {children}
    </div>
  );
}

const buttonClass = "w-full min-h-11 sm:w-auto md:min-h-0";

/**
 * Three ways to stop, kept apart in plain words (SY-041): turn sync off here,
 * sign this device out, or delete the cloud copy.
 */
export function SyncDangerZone({ status }: { status: SyncStatusView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [offerForce, setOfferForce] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleted, setDeleted] = useState<number | null>(null);
  const typedId = useId();

  const cloudDeleted = status.state === "cloud_data_deleted";

  async function run(
    action: () => Promise<{ ok: true } | SyncFailure>,
    onFailure?: (failure: SyncFailure) => void,
  ) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        onFailure?.(result);
        setError(describeSyncFailure(result));
      }
      return result.ok;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const signOut = (force: boolean) =>
    run(
      () => getSyncApi().signOutSync(force ? { force: true } : undefined),
      (failure) => {
        if (failure.reason === "offline") setOfferForce(true);
      },
    );

  async function handleDelete() {
    setDeleted(null);
    let days = DEFAULT_RETENTION_DAYS;
    const ok = await run(async () => {
      const result = await getSyncApi().deleteSyncCloudData();
      if (result.ok) days = result.timeTravelRetentionDays;
      return result;
    });
    if (ok) setDeleted(days);
    setConfirmDelete(false);
    setTyped("");
  }

  return (
    <div className="space-y-6" data-testid="sync-danger-zone">
      <h3 className="text-base font-semibold">Stop syncing</h3>

      <StopAction
        testId="sync-disable"
        title="Turn off sync on this device"
        keeps="your data on this device, this device's connection to sync, and the copy in the cloud."
        removes="nothing. This device just stops syncing. You can turn it back on here without a code."
      >
        {status.enabled ? (
          <Button
            variant="outline"
            className={buttonClass}
            disabled={busy}
            onClick={() => void run(() => getSyncApi().disableSync())}
          >
            Disable on this device
          </Button>
        ) : (
          <Button
            variant="outline"
            className={buttonClass}
            disabled={busy}
            onClick={() =>
              void run(() =>
                cloudDeleted
                  ? getSyncApi().startSync()
                  : getSyncApi().enableSync(),
              )
            }
          >
            {cloudDeleted ? "Start sync again" : "Turn sync back on"}
          </Button>
        )}
      </StopAction>

      <StopAction
        testId="sync-sign-out"
        title="Sign out this device"
        keeps="your data on this device and the copy in the cloud."
        removes="this device's connection to sync, and this device from your device list. To turn sync on again here you will need a new code."
      >
        <Button
          variant="outline"
          className={buttonClass}
          disabled={busy}
          onClick={() => {
            setOfferForce(false);
            setConfirmSignOut(true);
          }}
        >
          Sign out this device
        </Button>
        {offerForce && (
          <div
            className="space-y-2 rounded-md border border-border p-3"
            data-testid="sync-sign-out-offline"
          >
            <p className="text-sm">
              Budgie could not reach the sync server, so it cannot remove this
              device from your device list. You can sign out on this device
              only. Afterwards, remove this device from the device list on
              another of your devices, so that it can no longer sync.
            </p>
            <Button
              variant="destructive"
              className={buttonClass}
              disabled={busy}
              onClick={() => void signOut(true)}
            >
              Sign out on this device only
            </Button>
          </div>
        )}
      </StopAction>

      <StopAction
        testId="sync-delete"
        title="Delete my cloud data"
        keeps="your data on this device."
        removes={`the copy of your budget in the cloud, including its daily snapshots. Sync turns off on this device, and your other devices will stop syncing. Copies may persist for up to ${DEFAULT_RETENTION_DAYS} days.`}
      >
        <Button
          variant="destructive"
          className={buttonClass}
          disabled={busy}
          onClick={() => {
            setTyped("");
            setConfirmDelete(true);
          }}
        >
          Delete my cloud data
        </Button>
        {deleted !== null && (
          <p role="status" className="text-sm" data-testid="sync-delete-result">
            Your cloud data has been deleted. Sync is now off on this device and
            your data here is untouched. Your other devices will stop syncing.
            Copies may persist for up to {deleted} days. To start again, use
            Start sync again.
          </p>
        )}
      </StopAction>

      {error && (
        <p role="alert" className="text-sm text-destructive break-words">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={confirmSignOut}
        onOpenChange={setConfirmSignOut}
        title="Sign out this device?"
        description="This device will be disconnected from sync and removed from your device list. Your data here and the cloud copy stay. You will need a new code to connect again."
        confirmLabel="Sign out"
        onConfirm={() => void signOut(false)}
      />

      <ResponsiveOverlay
        open={confirmDelete}
        onOpenChange={(open) => {
          setConfirmDelete(open);
          if (!open) setTyped("");
        }}
      >
        <ResponsiveOverlayContent dialogClassName="sm:max-w-sm">
          <ResponsiveOverlayHeader>
            <ResponsiveOverlayTitle>Delete my cloud data?</ResponsiveOverlayTitle>
            <ResponsiveOverlayDescription>
              This erases the cloud copy and its snapshots. Your data on this
              device stays, and sync turns off here. Your other devices will
              stop syncing. Copies may persist for up to{" "}
              {DEFAULT_RETENTION_DAYS} days.
            </ResponsiveOverlayDescription>
          </ResponsiveOverlayHeader>
          <div className="flex flex-col gap-1.5 px-4 sm:px-0">
            <Label htmlFor={typedId}>Type delete to confirm</Label>
            <Input
              id={typedId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="min-h-11 md:min-h-0"
            />
          </div>
          <ResponsiveOverlayFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={typed.trim().toLowerCase() !== "delete" || busy}
              onClick={() => void handleDelete()}
            >
              Delete cloud data
            </Button>
          </ResponsiveOverlayFooter>
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>
    </div>
  );
}
