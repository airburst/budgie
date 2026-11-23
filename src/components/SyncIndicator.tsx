import { useSyncStatus } from "@/hooks/useSyncStatus";
import { cn } from "@/lib/utils";
import { syncIndicator } from "@/pages/Settings/sync/sync-messages";
import { CloudAlertIcon, CloudCheckIcon, CloudOffIcon, CloudUploadIcon } from "lucide-react";
import { Link } from "react-router";

const ICONS = {
  synced: CloudCheckIcon,
  pending: CloudUploadIcon,
  offline: CloudOffIcon,
  error: CloudAlertIcon,
} as const;

/** Small header indicator of the sync state. Renders nothing when sync is off. */
export function SyncIndicator({ className }: { className?: string }) {
  const { status } = useSyncStatus();
  const indicator = syncIndicator(status);
  if (!indicator) return null;
  const Icon = ICONS[indicator.kind];
  return (
    <Link
      to="/settings"
      aria-label={`Sync status: ${indicator.label}`}
      data-sync-state={indicator.kind}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring md:min-h-0",
        indicator.kind === "error"
          ? "text-destructive"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span>{indicator.label}</span>
    </Link>
  );
}
