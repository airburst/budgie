import { useSyncStatus } from "@/hooks/useSyncStatus";
import {
  isSyncNoticeState,
  syncNoticeNeedsAction,
  syncNoticeText,
} from "@/pages/Settings/sync/sync-messages";
import type { SyncState } from "@/services/sync/status";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const toastId = (state: string) => `sync-notice-${state}`;

/**
 * Toasts for sync problems that need attention (SY-043): clock too far ahead,
 * app too old, device disconnected, daily limit reached. Renders nothing.
 *
 * Once per occurrence: a toast is raised on the transition INTO the state, not
 * on every cycle that finds it unchanged. The first status read after a load
 * is not a transition, so a state that was already there stays quiet after a
 * reload, except "update needed" and "disconnected": sync is stopped until the
 * user acts, so they are told again until they do. Leaving a state dismisses
 * its toast.
 */
export function SyncNotices() {
  const { status } = useSyncStatus();
  const navigate = useNavigate();
  const previous = useRef<SyncState | null | undefined>(undefined);

  useEffect(() => {
    if (!status) return;
    const state: SyncState | null =
      status.supported && status.configured && status.enrolled
        ? status.state
        : null;
    const before = previous.current;
    previous.current = state;
    if (state === before) return;
    if (before && isSyncNoticeState(before)) toast.dismiss(toastId(before));
    if (!state || !isSyncNoticeState(state)) return;
    // The first read is a reload, not news, unless the user must act.
    if (before === undefined && !syncNoticeNeedsAction(state)) return;
    const needsAction = syncNoticeNeedsAction(state);
    toast.warning(syncNoticeText(state, status.retryAt), {
      id: toastId(state),
      duration: needsAction ? Infinity : 10_000,
      closeButton: true,
      action: needsAction
        ? { label: "Open Settings", onClick: () => void navigate("/settings") }
        : undefined,
    });
  }, [status, navigate]);

  return null;
}
