import {
  ResponsiveOverlay,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/responsive-overlay";
import { Button } from "@/components/ui/button";
import { getSyncApi } from "@/platform/sync-api";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DownloadBackupButton } from "./DownloadBackupButton";

type Check = "checking" | "ok" | "failed";

/**
 * The confirm step of a portable import while sync is on (SY-042). The import
 * overrides the cloud copy on every device, so this offers a backup first and
 * syncs before importing: rows another device created and this one has not
 * pulled would otherwise be deleted everywhere. If that sync fails (offline,
 * a server problem) the warning gets stronger but the user may still go on.
 */
export function SyncedImportDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [check, setCheck] = useState<Check>("checking");

  useEffect(() => {
    if (!open) return;
    let current = true;
    setCheck("checking");
    getSyncApi()
      .syncNow()
      .then((result) => {
        if (current)
          setCheck(
            result.ok &&
              (result.status.state === "synced" ||
                result.status.state === "pending")
              ? "ok"
              : "failed",
          );
      })
      .catch(() => {
        if (current) setCheck("failed");
      });
    return () => {
      current = false;
    };
  }, [open]);

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent
        dialogClassName="sm:max-w-md"
        initialFocus={cancelRef}
      >
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>
            Replace data on all devices?
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Sync is on, so this import will overwrite the cloud copy and the
            data on every device you have connected. Anything on those devices
            that is not in this file will be deleted there too. This cannot be
            undone.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <div
          className="space-y-3 px-4 text-sm sm:px-0"
          data-testid="sync-import-warning"
        >
          <p className="text-muted-foreground">
            Save a copy of your current data first, in case you need it back.
          </p>
          <DownloadBackupButton />
          {check === "checking" && (
            <p
              role="status"
              className="flex items-center gap-2 text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" />
              Checking for changes from your other devices…
            </p>
          )}
          {check === "ok" && (
            <p role="status" className="text-muted-foreground">
              This device is up to date with the cloud.
            </p>
          )}
          {check === "failed" && (
            <p role="alert" className="text-destructive">
              Budgie could not sync first, so it cannot see changes your other
              devices have made recently. Those changes will be lost. Go back
              and try again when you are online, unless you are sure.
            </p>
          )}
        </div>
        <ResponsiveOverlayFooter>
          <Button
            ref={cancelRef}
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={check === "checking"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {check === "failed" ? "Import anyway" : "Import data"}
          </Button>
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
