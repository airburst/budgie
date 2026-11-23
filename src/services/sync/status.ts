// Sync status and error handling (SPEC.md 10.6, story SY-033).
//
// `syncNow` runs one cycle and maps every outcome to a `SyncStatus`, writing
// `last_synced_at` (on a completed cycle) and `last_error` (JSON, below) in
// `sync_state`. Outcomes that stop syncing (update needed, disconnected,
// cloud data deleted) also clear `enabled`, so the stop survives a restart;
// local data, the token and the cursor are always kept. `readSyncStatus`
// rebuilds the same status from `sync_state` alone.
//
// | Outcome                                   | state               | stops |
// | ----------------------------------------- | ------------------- | ----- |
// | cycle completed, nothing left dirty       | synced              |       |
// | cycle completed, rows still dirty         | pending             |       |
// | some pushes rejected `drift`              | clock_ahead         |       |
// | no answer (SyncNetworkError, any non-HTTP |                     |       |
// |   failure of the transport)               | offline             |       |
// | 500, 4xx client bugs, 429, apply errors,  |                     |       |
// |   the push guard, anything unexpected     | error               |       |
// | 503 daily_limit                           | daily_limit         |       |
// | newer formatVersion in a response, 409    |                     |       |
// |   format_too_old                          | update_needed       | yes   |
// | 401 bad_token / revoked                   | disconnected        | yes   |
// | 409 data_reset                            | cloud_data_deleted  | yes   |
//
// 429 and 503 carry `retryAfter`; until that time `syncNow` returns the
// stored status without contacting the server. "update needed" lifts by
// itself once this app's format version reaches the one the server reported.

import type { DatabaseCapability } from "@/platform/database";
import { PORTABLE_TABLES } from "@/services/portable-data";
import {
  runSyncCycle,
  type SyncCycleResult,
  type SyncEngineDeps,
  type SyncTransport,
} from "@/services/sync/engine";
import {
  applyErrorCode,
  FormatTooNewError,
  SyncHttpError,
  SyncNetworkError,
} from "@/services/sync/errors";
import { SYNC_FORMAT_VERSION, toTimestamp } from "@/services/sync/payload";

export type SyncState =
  /** Sync is off on this device (never started, or turned off). */
  | "disabled"
  | "synced"
  | "pending"
  | "offline"
  | "error"
  | "clock_ahead"
  | "daily_limit"
  | "update_needed"
  | "disconnected"
  | "cloud_data_deleted";

/** States that turn sync off on this device until the user acts. */
export const STOPPING_STATES: ReadonlySet<SyncState> = new Set([
  "update_needed",
  "disconnected",
  "cloud_data_deleted",
]);

export type SyncErrorInfo = {
  /** Contract error code (`revoked`, `daily_limit`...) or engine code. */
  code: string;
  /** English text for logs; the UI shows its own wording per state. */
  message: string;
  /** When it happened, `YYYY-MM-DD HH:MM:SS` UTC. */
  at: string;
};

/** Plain, JSON-serialisable status for the UI (SY-035, SY-037). */
export type SyncStatus = {
  enabled: boolean;
  state: SyncState;
  /** Rows holding a local change the server has not acknowledged. */
  pendingCount: number;
  /** End of the last completed cycle, `YYYY-MM-DD HH:MM:SS` UTC. */
  lastSyncedAt: string | null;
  lastError: SyncErrorInfo | null;
  /** Seconds until the server accepts requests again (429, 503), else null. */
  retryAfter: number | null;
  /** The same as a time, `YYYY-MM-DD HH:MM:SS` UTC. */
  retryAt: string | null;
};

/** What `last_error` holds (JSON). */
type StoredError = SyncErrorInfo & {
  state: SyncState;
  retryAt: string | null;
  /** For update_needed: the format version the server requires. */
  formatVersion: number | null;
};

type StateRow = {
  enabled: number;
  last_synced_at: string | null;
  last_error: string | null;
};

const parseStoredError = (text: string | null): StoredError | null => {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as Partial<StoredError>;
    if (typeof value.state === "string" && typeof value.code === "string") {
      return {
        state: value.state,
        code: value.code,
        message: typeof value.message === "string" ? value.message : "",
        at: typeof value.at === "string" ? value.at : "",
        retryAt: typeof value.retryAt === "string" ? value.retryAt : null,
        formatVersion:
          typeof value.formatVersion === "number" ? value.formatVersion : null,
      };
    }
  } catch {
    // Not ours: shown as a generic error below.
  }
  return { state: "error", code: "unknown", message: text, at: "", retryAt: null, formatVersion: null };
};

const readRow = async (database: DatabaseCapability) => {
  const [row] = await database.query<StateRow>({
    sql: "SELECT enabled, last_synced_at, last_error FROM sync_state WHERE id = 1",
  });
  return {
    enabled: row?.enabled === 1,
    lastSyncedAt: row?.last_synced_at ?? null,
    error: parseStoredError(row?.last_error ?? null),
  };
};

/** Rows with an unacknowledged local change, over the ten tables. */
export const countPending = async (
  database: DatabaseCapability,
): Promise<number> => {
  const [row] = await database.query<{ n: number }>({
    sql: `SELECT ${PORTABLE_TABLES.map(
      (table) => `(SELECT COUNT(*) FROM ${table} WHERE sync_dirty = 1)`,
    ).join(" + ")} AS n`,
  });
  return row?.n ?? 0;
};

/** The current status from `sync_state` and the dirty rows. */
export const readSyncStatus = async (
  database: DatabaseCapability,
  options: { now?: () => number } = {},
): Promise<SyncStatus> => {
  const nowMs = (options.now ?? Date.now)();
  const { enabled, lastSyncedAt, error } = await readRow(database);
  const pendingCount = await countPending(database);
  const state: SyncState =
    error && STOPPING_STATES.has(error.state)
      ? error.state
      : !enabled
        ? "disabled"
        : error
          ? error.state
          : pendingCount > 0
            ? "pending"
            : "synced";
  const retryAt =
    error?.retryAt && error.retryAt > toTimestamp(nowMs) ? error.retryAt : null;
  const retryAfter = retryAt
    ? Math.max(
        1,
        Math.ceil((Date.parse(`${retryAt.replace(" ", "T")}Z`) - nowMs) / 1000),
      )
    : null;
  return {
    enabled,
    state,
    pendingCount,
    lastSyncedAt,
    lastError: error
      ? { code: error.code, message: error.message, at: error.at }
      : null,
    retryAfter,
    retryAt,
  };
};

type Outcome = {
  state: SyncState;
  code: string;
  message: string;
  retryAfter?: number | null;
  formatVersion?: number | null;
};

/** Maps a failed cycle to a state (SPEC.md 10.6). */
export const classifySyncError = (error: unknown): Outcome => {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof FormatTooNewError) {
    return {
      state: "update_needed",
      code: error.code,
      message,
      formatVersion: error.serverFormatVersion,
    };
  }
  if (error instanceof SyncNetworkError) {
    return { state: "offline", code: error.code, message };
  }
  if (error instanceof SyncHttpError) {
    const base = { code: error.code, message };
    if (error.status === 401) return { ...base, state: "disconnected" };
    if (error.code === "format_too_old") {
      const version = error.body.formatVersion;
      return {
        ...base,
        state: "update_needed",
        formatVersion: typeof version === "number" ? version : null,
      };
    }
    if (error.code === "data_reset") {
      return { ...base, state: "cloud_data_deleted" };
    }
    if (error.code === "daily_limit" || error.status === 503) {
      return { ...base, state: "daily_limit", retryAfter: error.retryAfter };
    }
    return { ...base, state: "error", retryAfter: error.retryAfter };
  }
  const code =
    applyErrorCode(error) ??
    (error instanceof Error &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unexpected");
  return { state: "error", code, message };
};

/** Any failure of the transport other than an HTTP error answer is "offline". */
export const offlineAware =
  (transport: SyncTransport): SyncTransport =>
  async (request, auth) => {
    try {
      return await transport(request, auth);
    } catch (error) {
      if (error instanceof SyncHttpError || error instanceof SyncNetworkError) {
        throw error;
      }
      throw new SyncNetworkError(
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  };

const writeState = (
  database: DatabaseCapability,
  values: {
    error: StoredError | null;
    lastSyncedAt?: string;
    enabled?: boolean;
  },
) => {
  const sets = ["last_error = ?"];
  const params: Array<string | number | null> = [
    values.error ? JSON.stringify(values.error) : null,
  ];
  if (values.lastSyncedAt !== undefined) {
    sets.push("last_synced_at = ?");
    params.push(values.lastSyncedAt);
  }
  if (values.enabled !== undefined) {
    sets.push("enabled = ?");
    params.push(values.enabled ? 1 : 0);
  }
  return database.execute({
    sql: `UPDATE sync_state SET ${sets.join(", ")} WHERE id = 1`,
    params,
  });
};

export type SyncNowDeps = SyncEngineDeps & {
  /** Called with the result of a completed cycle (SY-035: applied counts). */
  onCycle?: (result: SyncCycleResult) => void;
};

/**
 * Records a stopping state without a cycle: sync off on this device and the
 * state shown until the user acts, as `syncNow` does for the same outcome
 * (SY-035: a 401 on a device call, and "Delete my cloud data"). Token and
 * cursor are kept.
 */
export const recordSyncStop = (
  database: DatabaseCapability,
  stop: { state: SyncState; code: string; message: string; nowMs: number },
) =>
  writeState(database, {
    enabled: false,
    error: {
      state: stop.state,
      code: stop.code,
      message: stop.message,
      at: toTimestamp(stop.nowMs),
      retryAt: null,
      formatVersion: null,
    },
  });

/**
 * One sync cycle with status handling. Never throws for a sync outcome;
 * returns the resulting status. Does nothing (returns the stored status) when
 * sync is off on this device or the server asked to wait (`retryAt`).
 */
export const syncNow = async (
  database: DatabaseCapability,
  deps: SyncNowDeps,
): Promise<SyncStatus> => {
  const formatVersion = deps.formatVersion ?? SYNC_FORMAT_VERSION;
  const status = () => readSyncStatus(database, { now: deps.now });
  const stored = await readRow(database);

  if (!stored.enabled) {
    const updated =
      stored.error?.state === "update_needed" &&
      stored.error.formatVersion !== null &&
      formatVersion >= stored.error.formatVersion;
    if (!updated) return status();
    await writeState(database, { error: null, enabled: true });
  } else if (
    stored.error?.retryAt &&
    stored.error.retryAt > toTimestamp(deps.now())
  ) {
    return status();
  }

  try {
    const result = await runSyncCycle(database, {
      ...deps,
      transport: offlineAware(deps.transport),
    });
    deps.onCycle?.(result);
    const nowMs = deps.now();
    const drift = result.rejected.filter((r) => r.reason === "drift");
    await writeState(database, {
      lastSyncedAt: toTimestamp(nowMs),
      error:
        drift.length === 0
          ? null
          : {
              state: "clock_ahead",
              code: "drift",
              message: `${drift.length} change(s) rejected: this device's clock is ahead of the server's`,
              at: toTimestamp(nowMs),
              retryAt: null,
              formatVersion: null,
            },
    });
  } catch (error) {
    const outcome = classifySyncError(error);
    const nowMs = deps.now();
    await writeState(database, {
      error: {
        state: outcome.state,
        code: outcome.code,
        message: outcome.message,
        at: toTimestamp(nowMs),
        retryAt:
          outcome.retryAfter != null && outcome.retryAfter > 0
            ? toTimestamp(nowMs + outcome.retryAfter * 1000)
            : null,
        formatVersion: outcome.formatVersion ?? null,
      },
      ...(STOPPING_STATES.has(outcome.state) ? { enabled: false } : {}),
    });
  }
  return status();
};
