// Wording for sync outcomes. The engine's `message` is English text for logs;
// the UI picks its own plain wording per stable reason or state.

import type { SyncFailure, SyncStatusView } from "@/services/sync/api-types";
import type { SyncState } from "@/services/sync/status";

const waitText = (seconds: number | null): string => {
  if (seconds === null) return "a little while";
  if (seconds < 90) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  return `${Math.ceil(seconds / 60)} minutes`;
};

export function describeSyncFailure(failure: SyncFailure): string {
  switch (failure.reason) {
    case "bad_code":
      return "That code was not recognised. It may be wrong, already used or out of date. Check it and try again, or ask for a new one. Nothing has been changed.";
    case "offline":
      return "Budgie could not reach the sync server. Check your connection and try again. Nothing has been changed.";
    case "rate_limited":
      return `Too many attempts. Try again in ${waitText(failure.retryAfter)}.`;
    case "daily_limit":
      return "The sync service has reached its daily limit. Try again later.";
    case "update_needed":
      return "This version of Budgie is too old to sync. Reload the app to update it, then try again.";
    case "disconnected":
      return "This device has been disconnected from sync. You need a new code to connect it again.";
    case "not_active_tab":
      return "Budgie is open in another tab. Sync can only be changed in the tab that is in use.";
    case "invalid_input":
      return "Enter a code and a device name of up to 100 characters.";
    case "already_enrolled":
    case "already_started":
      return "Sync is already set up on this device.";
    case "consent_required":
      return "Please read and agree to the sync terms first.";
    case "not_configured":
    case "unsupported":
      return "Sync is not available in this version of Budgie.";
    default:
      return failure.message || "Something went wrong. Please try again.";
  }
}

const STATE_LABELS: Record<SyncState, string> = {
  disabled: "Off on this device",
  synced: "Up to date",
  pending: "Changes waiting to upload",
  offline: "Offline",
  error: "Error",
  clock_ahead: "This device's clock is ahead",
  daily_limit: "Daily limit reached",
  update_needed: "Budgie needs updating",
  disconnected: "Disconnected",
  cloud_data_deleted: "Cloud data was deleted",
};

export const syncStateLabel = (state: SyncState): string => STATE_LABELS[state];

/** The header indicator: null when sync is off. */
export type SyncIndicatorKind = "synced" | "pending" | "offline" | "error";

export function syncIndicator(
  status: SyncStatusView | null,
): { kind: SyncIndicatorKind; label: string } | null {
  if (!status || !status.supported || !status.configured || !status.started)
    return null;
  switch (status.state) {
    case "disabled":
      return null;
    case "synced":
      return { kind: "synced", label: "Synced" };
    case "pending":
      return { kind: "pending", label: `Pending ${status.pendingCount}` };
    case "offline":
      return { kind: "offline", label: "Offline" };
    default:
      return { kind: "error", label: "Sync error" };
  }
}

/** `YYYY-MM-DD HH:MM:SS` (UTC) as a local date and time. */
export function formatSyncTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

// SY-042 and SY-043: wording for the import warning and the sync notices.

/** `YYYY-MM-DD HH:MM:SS` (UTC) as a local time of day, or null. */
const formatRetryTime = (retryAt: string | null): string | null => {
  if (!retryAt) return null;
  const date = new Date(`${retryAt.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/** The states that raise a toast (SY-043). */
export type SyncNoticeState =
  "clock_ahead" | "update_needed" | "disconnected" | "daily_limit";

export const isSyncNoticeState = (state: SyncState): state is SyncNoticeState =>
  state === "clock_ahead" ||
  state === "update_needed" ||
  state === "disconnected" ||
  state === "daily_limit";

/** Needs the user to act: shown again after a reload while it still holds. */
export const syncNoticeNeedsAction = (state: SyncNoticeState): boolean =>
  state === "update_needed" || state === "disconnected";

export function syncNoticeText(
  state: SyncNoticeState,
  retryAt: string | null,
): string {
  switch (state) {
    case "clock_ahead":
      return "This device's clock is too far ahead, so some changes were not synced. Correct the date and time on this device, then sync again.";
    case "update_needed":
      return "This version of Budgie is too old to sync. Reload the app to update it.";
    case "disconnected":
      return "This device was disconnected from sync. Connect it again with a new code in Settings.";
    case "daily_limit": {
      const time = formatRetryTime(retryAt);
      return `The sync service has reached its daily limit. Budgie will try again ${time ? `at ${time}` : "later"}.`;
    }
  }
}

/** An import the sync engine refused: nothing was changed. */
export function describeImportError(error: unknown): string {
  if (error instanceof Error && error.name === "InvalidOutgoingEnvelopeError") {
    const { table, publicId } = error as Error & {
      table?: string;
      publicId?: string | null;
    };
    const row = table
      ? ` (${table}${publicId ? `, row ${publicId}` : ""})`
      : "";
    return `This file can't be synced${row}. Your data has not been changed. Turn sync off to import it, or use a different file.`;
  }
  return error instanceof Error ? error.message : "Import failed";
}
