import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { getSyncApi } from "@/platform/sync-api";
import type { DeviceCode, SyncDevice } from "@/services/sync/api-types";
import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { describeSyncFailure } from "./sync-messages";

/** Device times are ISO 8601 from the server (not the SQLite form `formatSyncTime` reads). */
function formatDeviceTime(value: string | null, empty: string): string {
  if (!value) return empty;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * "Add a device" (a short code for another app to connect with) and the list
 * of connected devices, where any other device can be removed (SY-040).
 */
export function SyncDevices() {
  const [devices, setDevices] = useState<SyncDevice[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<SyncDevice | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getSyncApi().listSyncDevices();
      if (result.ok) {
        setDevices(result.devices);
        setListError(null);
      } else {
        setListError(describeSyncFailure(result));
      }
    } catch (caught) {
      setListError(
        caught instanceof Error ? caught.message : "Could not list devices",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAdd() {
    setCodeBusy(true);
    setCodeError(null);
    try {
      const result = await getSyncApi().createSyncDeviceCode();
      if (result.ok) setCode({ code: result.code, expiresAt: result.expiresAt });
      else setCodeError(describeSyncFailure(result));
    } catch (caught) {
      setCodeError(
        caught instanceof Error ? caught.message : "Could not make a code",
      );
    } finally {
      setCodeBusy(false);
    }
  }

  async function handleRemove(device: SyncDevice) {
    setRemoveError(null);
    try {
      const result = await getSyncApi().revokeSyncDevice(device.id);
      if (!result.ok) setRemoveError(describeSyncFailure(result));
    } catch (caught) {
      setRemoveError(
        caught instanceof Error ? caught.message : "Could not remove device",
      );
    }
    await load();
  }

  return (
    <div className="space-y-4" data-testid="sync-devices">
      <h3 className="text-base font-semibold">Devices</h3>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          To connect another phone, tablet or computer, make a code here and
          enter it in Budgie on that device.
        </p>
        <Button
          variant="outline"
          className="w-full min-h-11 sm:w-auto md:min-h-0"
          onClick={() => void handleAdd()}
          disabled={codeBusy}
        >
          {codeBusy ? <Loader2 className="animate-spin" /> : <Plus />}
          Add a device
        </Button>
        {code && (
          <div
            className="rounded-md border border-border p-3 space-y-1"
            data-testid="sync-device-code"
          >
            <p className="text-sm text-muted-foreground">Your code</p>
            <p className="font-mono text-2xl font-semibold tracking-wider break-all">
              {code.code}
            </p>
            <p className="text-sm text-muted-foreground">
              Expires at {formatDeviceTime(code.expiresAt, "soon")}. It works
              once.
            </p>
          </div>
        )}
        {codeError && (
          <p role="alert" className="text-sm text-destructive break-words">
            {codeError}
          </p>
        )}
      </div>

      {listError && (
        <p role="alert" className="text-sm text-destructive break-words">
          {listError}
        </p>
      )}
      {devices && (
        <ul className="space-y-2" aria-label="Connected devices">
          {devices.map((device) => (
            <li
              key={device.id}
              className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid="sync-device"
            >
              <div className="min-w-0 space-y-0.5 text-sm">
                <p className="break-words font-medium">
                  {device.name}
                  {device.current && (
                    <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal">
                      This device
                    </span>
                  )}
                </p>
                <p className="text-muted-foreground">
                  Added {formatDeviceTime(device.createdAt, "unknown")}
                </p>
                <p className="text-muted-foreground">
                  Last seen {formatDeviceTime(device.lastSeenAt, "not yet")}
                </p>
              </div>
              {!device.current && (
                <Button
                  variant="outline"
                  className="w-full min-h-11 sm:w-auto md:min-h-0"
                  aria-label={`Remove ${device.name}`}
                  onClick={() => setToRemove(device)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {removeError && (
        <p role="alert" className="text-sm text-destructive break-words">
          {removeError}
        </p>
      )}
      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(open) => {
          if (!open) setToRemove(null);
        }}
        title={`Remove ${toRemove?.name ?? "this device"}?`}
        description="That device will stop syncing and will need a new code to connect again. Its own data stays on it, and the cloud copy is not changed."
        confirmLabel="Remove device"
        onConfirm={() => toRemove && void handleRemove(toRemove)}
      />
    </div>
  );
}
