import { authenticate } from "./auth";
import { ApiError, jsonResponse } from "./errors";
import type { SqlExecutor } from "./executor";
import type { LogContext } from "./log";
import { snapshotKey, snapshotPrefix, type SnapshotStore } from "./store";

/** D1 Time Travel keeps point-in-time copies for this long on the free plan. */
export const TIME_TRAVEL_RETENTION_DAYS = 7;

export interface DeleteResult {
  deletedRows: number;
  deletedSnapshots: number;
}

/**
 * Remove every stored row and snapshot of one user (SPEC 9.7). The user and
 * devices stay. `data_epoch` is bumped so every earlier cursor answers
 * `data_reset`; `users.seq` is never reset.
 *
 * One batch deletes the rows, bumps the epoch and deletes the snapshot index
 * rows. That order matters to the snapshot job (see snapshot.ts): once the index
 * rows are gone, a snapshot that is mid-write notices and removes its own
 * object. Objects are then deleted by their index dates and, when the store can
 * list, by key prefix, so nothing indexed or not is left behind. If an R2
 * delete fails the request fails; running it again removes what is left (by
 * prefix; the CLI store cannot list, so there a retry only helps for objects
 * still indexed, which is why the API path is the authoritative one).
 *
 * With `callerDeviceId` (the API path) every statement is conditional on that
 * device still being active, so a revoke that lands after authentication
 * cannot be followed by a delete.
 */
export async function deleteUserData(
  executor: SqlExecutor,
  store: SnapshotStore | undefined,
  userId: string,
  callerDeviceId?: string,
): Promise<DeleteResult> {
  const guard = callerDeviceId
    ? " AND EXISTS (SELECT 1 FROM devices WHERE id = ? AND revoked_at IS NULL)"
    : "";
  const g = callerDeviceId ? [callerDeviceId] : [];
  const results = await executor.batch([
    {
      sql: `SELECT count(*) AS n FROM changes WHERE user_id = ?${guard}`,
      params: [userId, ...g],
    },
    {
      sql: `SELECT snapshot_date FROM snapshots WHERE user_id = ?${guard}`,
      params: [userId, ...g],
    },
    {
      sql: `DELETE FROM changes WHERE user_id = ?${guard}`,
      params: [userId, ...g],
    },
    {
      sql: `UPDATE users SET data_epoch = data_epoch + 1 WHERE id = ?${guard}`,
      params: [userId, ...g],
    },
    {
      sql: `DELETE FROM snapshots WHERE user_id = ?${guard}`,
      params: [userId, ...g],
    },
    {
      sql: "SELECT revoked_at FROM devices WHERE id = ?",
      params: [callerDeviceId ?? ""],
    },
  ]);
  if (callerDeviceId) {
    const dev = results[5]?.rows[0];
    if (!dev) throw new ApiError("bad_token");
    if (dev.revoked_at !== null && dev.revoked_at !== undefined) {
      throw new ApiError("revoked");
    }
  }
  const keys = new Set<string>();
  for (const row of results[1]?.rows ?? []) {
    keys.add(snapshotKey(userId, row.snapshot_date as string));
  }
  if (store?.list) {
    for (const key of await store.list(snapshotPrefix(userId))) keys.add(key);
  }
  for (const key of keys) await store?.delete(key);
  return {
    deletedRows: Number(results[0]?.rows[0]?.n ?? 0),
    deletedSnapshots: keys.size,
  };
}

/** DELETE /v1/data */
export async function handleDeleteData(
  request: Request,
  deps: {
    executor: SqlExecutor;
    now: () => number;
    store?: SnapshotStore;
    ctx?: LogContext;
  },
): Promise<Response> {
  const auth = await authenticate(deps.executor, request, deps.now(), deps.ctx);
  const result = await deleteUserData(
    deps.executor,
    deps.store,
    auth.userId,
    auth.deviceId,
  );
  if (deps.ctx) {
    deps.ctx.counts = {
      deletedRows: result.deletedRows,
      deletedSnapshots: result.deletedSnapshots,
    };
  }
  return jsonResponse({
    ...result,
    timeTravelRetentionDays: TIME_TRAVEL_RETENTION_DAYS,
  });
}
