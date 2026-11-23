// The sync methods of the application API (SY-035): types only, so
// `src/types/electron.d.ts` can use them without pulling in the engine.
//
// No method throws for an expected outcome. Each resolves to `SyncResult<T>`:
// `{ ok: true, ...T }` or `{ ok: false, reason, message }` where `reason` is a
// stable code the UI maps to its own wording (`message` is English, for logs).

import type { SyncStatus } from "@/services/sync/status";
import type { DeviceCode, SyncDevice } from "@/services/sync/transport";

export type { DeviceCode, SyncDevice };

export type SyncFailureReason =
  /** This platform has no sync (Electron). */
  | "unsupported"
  /** Another tab holds the instance lock; only that tab may change sync. */
  | "not_active_tab"
  /** The user has not accepted the consent screen. */
  | "consent_required"
  /** The build has no sync server (`VITE_SYNC_SERVER_URL` unset). */
  | "not_configured"
  /** A required argument is empty or too long (device name, code). */
  | "invalid_input"
  /** Nothing to act on: this device has no device id and token. */
  | "not_enrolled"
  /** Enrolled, but Start or Join has not run (no cursor). */
  | "not_started"
  /** Sync is already on here: sign out or disable first. */
  | "already_enrolled"
  | "already_started"
  /** Start refused: the server holds data, so Join instead. */
  | "server_has_data"
  /** Join refused: the server holds no data, so Start instead. */
  | "server_empty"
  /** The code is unknown, used or expired. */
  | "bad_code"
  /** No answer from the server. Nothing was changed. */
  | "offline"
  /** 401: this device was revoked or its token is unknown. Needs a new code. */
  | "disconnected"
  /** The server needs a newer app. */
  | "update_needed"
  | "rate_limited"
  | "daily_limit"
  | "not_found"
  | "error";

export type SyncFailure = {
  ok: false;
  reason: SyncFailureReason;
  message: string;
  /** Seconds to wait (`rate_limited`, `daily_limit`), else null. */
  retryAfter: number | null;
};

export type SyncResult<T extends object = object> =
  | ({ ok: true } & T)
  | SyncFailure;

/** `SyncStatus` plus what the UI needs to pick its screen. */
export type SyncStatusView = SyncStatus & {
  /** False on platforms without sync (Electron). */
  supported: boolean;
  /** False when the build has no sync server: hide or disable the section. */
  configured: boolean;
  /** Consent recorded (`sync_state.consent_at`). */
  consented: boolean;
  /** Device id and token held. */
  enrolled: boolean;
  /** Start or Join has run (a cursor is stored). */
  started: boolean;
  /** Public ids of accounts whose reconciliation no longer adds up. */
  reconciliationReview: string[];
};

/** Pushed after every operation here that may have changed local data. */
export type SyncChangeEvent = {
  status: SyncStatusView;
  /** Rows written locally by the operation (0: nothing new to show). */
  appliedRows: number;
};

export type SyncApi = {
  /** Readable in any tab, with or without the lock. */
  getSyncStatus: () => Promise<SyncStatusView>;
  /**
   * Exchanges a code for a device token (the first request to the server).
   * `consent` must be `true`; nothing is sent otherwise. Returns whether the
   * server already holds data: offer Join if so, else Start.
   */
  enrolSync: (request: {
    code: string;
    deviceName: string;
    consent: boolean;
  }) => Promise<SyncResult<{ hasData: boolean }>>;
  /** First device: upload everything. Refused when the server has data. */
  startSync: () => Promise<SyncResult<{ status: SyncStatusView }>>;
  /**
   * Later device: replace local data with the cloud's, then run a cycle.
   * Refused when the server is empty. The UI must offer a backup first.
   */
  joinSync: () => Promise<
    SyncResult<{ status: SyncStatusView; appliedRows: number }>
  >;
  /** One queued cycle. Never overlaps another operation. */
  syncNow: () => Promise<
    SyncResult<{ status: SyncStatusView; appliedRows: number }>
  >;
  /** Stop syncing here; token and cursor kept, no code needed to resume. */
  disableSync: () => Promise<SyncResult<{ status: SyncStatusView }>>;
  /** Resume after `disableSync`; runs a cycle. */
  enableSync: () => Promise<SyncResult<{ status: SyncStatusView }>>;
  /**
   * Revokes this device on the server, then forgets token and cursor. Offline,
   * it fails with `offline` and changes nothing, unless `force` is set: then
   * the local sign out happens anyway and `serverRevoked` is false (the device
   * stays in the list: remove it from another device).
   */
  signOutSync: (options?: { force?: boolean }) => Promise<
    SyncResult<{ serverRevoked: boolean; status: SyncStatusView }>
  >;
  /** `DELETE /v1/data`, then sync off here. Offline: fails, nothing changed. */
  deleteSyncCloudData: () => Promise<
    SyncResult<{
      deletedRows: number;
      deletedSnapshots: number;
      timeTravelRetentionDays: number;
      status: SyncStatusView;
    }>
  >;
  listSyncDevices: () => Promise<SyncResult<{ devices: SyncDevice[] }>>;
  /** The caller's own id is a sign out (`signedOut: true`). */
  revokeSyncDevice: (
    deviceId: string,
  ) => Promise<SyncResult<{ signedOut: boolean }>>;
  createSyncDeviceCode: () => Promise<SyncResult<DeviceCode>>;
  /** Subscribe to changes; returns the unsubscribe function. */
  onSyncChange: (listener: (event: SyncChangeEvent) => void) => () => void;
};
