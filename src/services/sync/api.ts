// The sync methods of the application API (SY-035), as a controller over the
// engine: enrol, start, join, sync now, disable/enable, sign out, delete cloud
// data and the device calls.
//
// Rules
// - Reading the status works in any tab. Everything else needs the instance
//   lock (`hasLock()`): a tab without it gets `not_active_tab` and nothing
//   happens. (A tab without the lock normally has no database at all.)
// - One operation at a time. Every operation that reads or writes
//   `sync_state` or runs a cycle goes through one promise queue
//   (`exclusive`), so a cycle never overlaps another cycle, Start, Join,
//   sign out or delete. `syncNow` is the single entry point for "run a
//   cycle": calls made while one is already waiting share that waiting cycle.
//   SY-039's triggers (focus, timers, writes) call `syncNow` and nothing else.
//   Only the pure device calls (list, create code, revoke another device)
//   skip the queue: they never touch local data and must not wait for a cycle.
// - No request goes to the sync server before `enrolSync` has been called with
//   `consent: true`: every other server call needs the token that enrol
//   stores, and enrol itself refuses without consent.
// - Sign out offline: nothing is changed and `offline` is returned, because
//   forgetting the token locally while the server still trusts it would leave
//   an active device that nobody can see or revoke from here. `force: true`
//   signs out locally anyway (`serverRevoked: false`). Delete cloud data
//   offline: nothing is changed, `offline` is returned (there is no local
//   substitute for deleting server data).

import type { DatabaseCapability } from "@/platform/database";
import { defaultAfterApplyHooks } from "@/services/sync/after-apply";
import type {
  SyncChangeEvent,
  SyncApi,
  SyncFailure,
  SyncFailureReason,
  SyncResult,
  SyncStatusView,
} from "@/services/sync/api-types";
import type { SyncEngineDeps, SyncTransport } from "@/services/sync/engine";
import {
  FormatTooNewError,
  SyncConsentRequiredError,
  SyncHttpError,
  SyncNetworkError,
  SyncNotConfiguredError,
} from "@/services/sync/errors";
import { joinSync } from "@/services/sync/join";
import { toTimestamp } from "@/services/sync/payload";
import { findReconciliationsNeedingReview } from "@/services/sync/reconciliation-review";
import {
  serverHasData,
  startSync,
  StartRefusedError,
} from "@/services/sync/start";
import {
  offlineAware,
  readSyncStatus,
  recordSyncStop,
  syncNow,
  type SyncNowDeps,
} from "@/services/sync/status";
import type { SyncServerClient } from "@/services/sync/transport";

export type SyncApiDeps = {
  database: DatabaseCapability;
  transport: SyncTransport;
  server: SyncServerClient;
  /** The configured sync server (`SYNC_SERVER_URL`); null: none. */
  serverUrl: string | null;
  /** True while this tab holds the instance lock. */
  hasLock: () => boolean;
  /** Stored with the consent. */
  appVersion: string;
  now?: () => number;
  afterApply?: SyncEngineDeps["afterApply"];
  formatVersion?: number;
};

type Identity = {
  deviceId: string | null;
  token: string | null;
  serverUrl: string | null;
  cursor: string | null;
  enabled: boolean;
  consentAt: string | null;
};

const MAX_DEVICE_NAME = 100;

const sum = (counts: Record<string, number>) =>
  Object.values(counts).reduce((total, n) => total + n, 0);

const failure = (
  reason: SyncFailureReason,
  message: string,
  retryAfter: number | null = null,
): SyncFailure => ({ ok: false, reason, message, retryAfter });

/** Maps anything thrown by the engine or the server client to a failure. */
export const failureFromError = (error: unknown): SyncFailure => {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof SyncNetworkError) return failure("offline", message);
  if (error instanceof StartRefusedError) {
    return failure("server_has_data", message);
  }
  if (error instanceof SyncConsentRequiredError) {
    return failure("consent_required", message);
  }
  if (error instanceof SyncNotConfiguredError) {
    return failure("not_configured", message);
  }
  if (error instanceof FormatTooNewError) {
    return failure("update_needed", message);
  }
  if (error instanceof SyncHttpError) {
    if (error.status === 401) return failure("disconnected", message);
    if (error.code === "bad_code") return failure("bad_code", message);
    if (error.code === "format_too_old") {
      return failure("update_needed", message);
    }
    if (error.code === "not_found") return failure("not_found", message);
    if (error.code === "rate_limited") {
      return failure("rate_limited", message, error.retryAfter);
    }
    if (error.code === "daily_limit" || error.status === 503) {
      return failure("daily_limit", message, error.retryAfter);
    }
  }
  return failure("error", message);
};

export const createSyncApi = (deps: SyncApiDeps) => {
  const { database, server } = deps;
  const now = deps.now ?? Date.now;
  const transport = offlineAware(deps.transport);
  const engineDeps = (): SyncEngineDeps => ({
    transport,
    now,
    afterApply: deps.afterApply ?? defaultAfterApplyHooks,
    ...(deps.formatVersion === undefined
      ? {}
      : { formatVersion: deps.formatVersion }),
  });

  // --- queue ---------------------------------------------------------------

  let tail: Promise<unknown> = Promise.resolve();
  /** Runs `operation` after every earlier operation has finished. */
  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const run = tail.then(operation);
    tail = run.catch(() => undefined);
    return run;
  };

  const listeners = new Set<(event: SyncChangeEvent) => void>();
  const emit = async (appliedRows: number) => {
    if (listeners.size === 0) return;
    const event: SyncChangeEvent = { status: await readStatus(), appliedRows };
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // A listener's bug must not break sync.
      }
    }
  };

  // --- reads ---------------------------------------------------------------

  const readIdentity = async (): Promise<Identity> => {
    const [row] = await database.query<{
      device_id: string | null;
      token: string | null;
      server_url: string | null;
      cursor: string | null;
      enabled: number;
      consent_at: string | null;
    }>({
      sql: "SELECT device_id, token, server_url, cursor, enabled, consent_at FROM sync_state WHERE id = 1",
    });
    return {
      deviceId: row?.device_id ?? null,
      token: row?.token ?? null,
      serverUrl: row?.server_url ?? null,
      cursor: row?.cursor ?? null,
      enabled: row?.enabled === 1,
      consentAt: row?.consent_at ?? null,
    };
  };

  const readStatus = async (): Promise<SyncStatusView> => {
    const base = await readSyncStatus(database, { now });
    const identity = await readIdentity();
    const enrolled = Boolean(identity.deviceId && identity.token);
    return {
      ...base,
      supported: true,
      configured: deps.serverUrl !== null,
      consented: identity.consentAt !== null,
      enrolled,
      started: enrolled && identity.cursor !== null,
      reconciliationReview: enrolled
        ? await findReconciliationsNeedingReview(database)
        : [],
    };
  };

  // --- helpers -------------------------------------------------------------

  const requireLock = (): SyncFailure | null =>
    deps.hasLock()
      ? null
      : failure(
          "not_active_tab",
          "Another Budgie tab is active; sync can only be changed there",
        );

  /** The enrolled device, or the failure to return. */
  const enrolled = (
    identity: Identity,
  ):
    | { ok: true; deviceId: string; auth: { token: string; serverUrl: string | null } }
    | SyncFailure =>
    identity.deviceId && identity.token
      ? {
          ok: true,
          deviceId: identity.deviceId,
          auth: { token: identity.token, serverUrl: identity.serverUrl },
        }
      : failure("not_enrolled", "This device is not enrolled for sync");

  /** A failure from a call made with the token; 401 also stops sync here. */
  const tokenFailure = async (error: unknown): Promise<SyncFailure> => {
    const result = failureFromError(error);
    if (result.reason === "disconnected") {
      await recordSyncStop(database, {
        state: "disconnected",
        code: error instanceof SyncHttpError ? error.code : "bad_token",
        message: result.message,
        nowMs: now(),
      });
      await emit(0);
    }
    return result;
  };

  /** One queued cycle through `syncNow`; counts applied rows. */
  const cycle = async (): Promise<{
    status: SyncStatusView;
    appliedRows: number;
  }> => {
    let appliedRows = 0;
    const cycleDeps: SyncNowDeps = {
      ...engineDeps(),
      onCycle: (result) => {
        appliedRows += sum(result.applied);
      },
    };
    await syncNow(database, cycleDeps);
    return { status: await readStatus(), appliedRows };
  };

  // --- operations ----------------------------------------------------------

  const getSyncStatus: SyncApi["getSyncStatus"] = readStatus;

  const enrolSync: SyncApi["enrolSync"] = async (request) => {
    const locked = requireLock();
    if (locked) return locked;
    if (request.consent !== true) {
      return failure(
        "consent_required",
        "Sync needs the user's consent before anything is sent",
      );
    }
    if (deps.serverUrl === null) {
      return failure("not_configured", "This build has no sync server");
    }
    const code = request.code.trim();
    const deviceName = request.deviceName.trim();
    if (code === "" || deviceName === "" || deviceName.length > MAX_DEVICE_NAME) {
      return failure(
        "invalid_input",
        `A code and a device name of 1 to ${MAX_DEVICE_NAME} characters are needed`,
      );
    }
    return exclusive(async (): Promise<SyncResult<{ hasData: boolean }>> => {
      const identity = await readIdentity();
      if (identity.enabled) {
        return failure(
          "already_enrolled",
          "Sync is on: disable or sign out before enrolling again",
        );
      }
      try {
        const response = await server.enrol({ code, deviceName });
        // The cursor goes back to NULL: this is a new device for the server,
        // so Start or Join must run again before anything is pushed.
        await database.execute({
          sql: `UPDATE sync_state SET device_id = ?, token = ?, server_url = ?,
              cursor = NULL, enabled = 0, last_error = NULL, last_synced_at = NULL,
              consent_at = ?, consent_app_version = ? WHERE id = 1`,
          params: [
            response.deviceId,
            response.token,
            deps.serverUrl,
            toTimestamp(now()),
            deps.appVersion,
          ],
        });
        await emit(0);
        return { ok: true, hasData: response.hasData };
      } catch (error) {
        return failureFromError(error);
      }
    });
  };

  const startApi: SyncApi["startSync"] = async () => {
    const locked = requireLock();
    if (locked) return locked;
    return exclusive(async () => {
      const identity = await readIdentity();
      const device = enrolled(identity);
      if (!device.ok) return device;
      if (identity.consentAt === null) {
        return failureFromError(new SyncConsentRequiredError());
      }
      if (identity.enabled && identity.cursor !== null) {
        return failure("already_started", "Sync is already running here");
      }
      try {
        let appliedRows = 0;
        await startSync(database, {
          ...engineDeps(),
          onCycle: (result) => {
            appliedRows += sum(result.applied);
          },
        });
        const status = await readStatus();
        await emit(appliedRows);
        return { ok: true as const, status };
      } catch (error) {
        return tokenFailure(error);
      }
    });
  };

  const joinApi: SyncApi["joinSync"] = async () => {
    const locked = requireLock();
    if (locked) return locked;
    return exclusive(async () => {
      const identity = await readIdentity();
      const device = enrolled(identity);
      if (!device.ok) return device;
      if (identity.consentAt === null) {
        return failureFromError(new SyncConsentRequiredError());
      }
      try {
        // Never replace local data with nothing.
        if (!(await serverHasData(database, engineDeps()))) {
          return failure(
            "server_empty",
            "The server holds no data: Start instead of Join",
          );
        }
        const joined = await joinSync(database, engineDeps());
        await database.execute({
          sql: "UPDATE sync_state SET enabled = 1, last_error = NULL WHERE id = 1",
        });
        const { status, appliedRows } = await cycle();
        const total = appliedRows + sum(joined.applied);
        await emit(total);
        return { ok: true as const, status, appliedRows: total };
      } catch (error) {
        return tokenFailure(error);
      }
    });
  };

  let waitingCycle: Promise<
    SyncResult<{ status: SyncStatusView; appliedRows: number }>
  > | null = null;

  /** The single entry point for running a cycle (see the header). */
  const syncNowApi: SyncApi["syncNow"] = () => {
    const locked = requireLock();
    if (locked) return Promise.resolve(locked);
    if (waitingCycle) return waitingCycle;
    const run = exclusive(async () => {
      waitingCycle = null;
      const identity = await readIdentity();
      const device = enrolled(identity);
      if (!device.ok) return device;
      if (identity.cursor === null) {
        return failure("not_started", "Start or Join has not run on this device");
      }
      try {
        const result = await cycle();
        await emit(result.appliedRows);
        return { ok: true as const, ...result };
      } catch (error) {
        return failureFromError(error);
      }
    });
    waitingCycle = run;
    return run;
  };

  const disableSync: SyncApi["disableSync"] = async () => {
    const locked = requireLock();
    if (locked) return locked;
    return exclusive(async () => {
      await database.execute({
        sql: "UPDATE sync_state SET enabled = 0, last_error = NULL WHERE id = 1",
      });
      const status = await readStatus();
      await emit(0);
      return { ok: true as const, status };
    });
  };

  const enableSync: SyncApi["enableSync"] = async () => {
    const locked = requireLock();
    if (locked) return locked;
    return exclusive(async () => {
      const identity = await readIdentity();
      const device = enrolled(identity);
      if (!device.ok) return device;
      if (identity.consentAt === null) {
        return failureFromError(new SyncConsentRequiredError());
      }
      if (identity.cursor === null) {
        return failure("not_started", "Start or Join has not run on this device");
      }
      try {
        await database.execute({
          sql: "UPDATE sync_state SET enabled = 1, last_error = NULL WHERE id = 1",
        });
        const { status, appliedRows } = await cycle();
        await emit(appliedRows);
        return { ok: true as const, status };
      } catch (error) {
        return failureFromError(error);
      }
    });
  };

  const forgetDevice = async () => {
    await database.execute({
      sql: `UPDATE sync_state SET device_id = NULL, token = NULL, cursor = NULL,
          enabled = 0, last_error = NULL, last_synced_at = NULL WHERE id = 1`,
    });
  };

  const signOutLocked = async (
    force: boolean,
  ): Promise<SyncResult<{ serverRevoked: boolean; status: SyncStatusView }>> => {
    const identity = await readIdentity();
    const device = enrolled(identity);
    if (!device.ok) return device;
    let serverRevoked = true;
    try {
      await server.revokeDevice(device.auth, device.deviceId);
    } catch (error) {
      const result = failureFromError(error);
      // 401 (already revoked) and 404 (already gone): nothing left to revoke.
      if (result.reason !== "disconnected" && result.reason !== "not_found") {
        if (!force) return result;
        serverRevoked = false;
      }
    }
    await forgetDevice();
    const status = await readStatus();
    await emit(0);
    return { ok: true, serverRevoked, status };
  };

  const signOutSync: SyncApi["signOutSync"] = async (options) => {
    const locked = requireLock();
    if (locked) return locked;
    return exclusive(() => signOutLocked(options?.force === true));
  };

  const deleteSyncCloudData: SyncApi["deleteSyncCloudData"] = async () => {
    const locked = requireLock();
    if (locked) return locked;
    return exclusive(async () => {
      const device = enrolled(await readIdentity());
      if (!device.ok) return device;
      try {
        const deleted = await server.deleteData(device.auth);
        // Same stop `syncNow` records for a `data_reset` answer: sync off,
        // token, cursor and local data kept, Start offered.
        await recordSyncStop(database, {
          state: "cloud_data_deleted",
          code: "data_reset",
          message: "Cloud data was deleted from this device",
          nowMs: now(),
        });
        const status = await readStatus();
        await emit(0);
        return { ok: true as const, ...deleted, status };
      } catch (error) {
        return tokenFailure(error);
      }
    });
  };

  const listSyncDevices: SyncApi["listSyncDevices"] = async () => {
    const locked = requireLock();
    if (locked) return locked;
    const device = enrolled(await readIdentity());
    if (!device.ok) return device;
    try {
      return { ok: true, devices: await server.listDevices(device.auth) };
    } catch (error) {
      return tokenFailure(error);
    }
  };

  const revokeSyncDevice: SyncApi["revokeSyncDevice"] = async (deviceId) => {
    const locked = requireLock();
    if (locked) return locked;
    const identity = await readIdentity();
    const device = enrolled(identity);
    if (!device.ok) return device;
    if (deviceId === device.deviceId) {
      const result = await exclusive(() => signOutLocked(false));
      return result.ok ? { ok: true, signedOut: true } : result;
    }
    try {
      await server.revokeDevice(device.auth, deviceId);
      return { ok: true, signedOut: false };
    } catch (error) {
      return tokenFailure(error);
    }
  };

  const createSyncDeviceCode: SyncApi["createSyncDeviceCode"] = async () => {
    const locked = requireLock();
    if (locked) return locked;
    const device = enrolled(await readIdentity());
    if (!device.ok) return device;
    try {
      return { ok: true, ...(await server.createDeviceCode(device.auth)) };
    } catch (error) {
      return tokenFailure(error);
    }
  };

  const onSyncChange: SyncApi["onSyncChange"] = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const api: SyncApi = {
    getSyncStatus,
    enrolSync,
    startSync: startApi,
    joinSync: joinApi,
    syncNow: syncNowApi,
    disableSync,
    enableSync,
    signOutSync,
    deleteSyncCloudData,
    listSyncDevices,
    revokeSyncDevice,
    createSyncDeviceCode,
    onSyncChange,
  };
  return api;
};
