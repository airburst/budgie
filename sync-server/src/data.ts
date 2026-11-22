import { authenticate } from "./auth";
import { jsonResponse } from "./errors";
import type { SqlExecutor } from "./executor";
import type { LogContext } from "./log";
import { snapshotKey, type SnapshotStore } from "./store";

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
 * Rows go first, in one batch. Snapshots follow one by one; if R2 fails part
 * way the index rows of the survivors remain, so running it again finishes the job.
 */
export async function deleteUserData(
  executor: SqlExecutor,
  store: SnapshotStore | undefined,
  userId: string,
): Promise<DeleteResult> {
  const [count, , , snaps] = await executor.batch([
    {
      sql: "SELECT count(*) AS n FROM changes WHERE user_id = ?",
      params: [userId],
    },
    { sql: "DELETE FROM changes WHERE user_id = ?", params: [userId] },
    {
      sql: "UPDATE users SET data_epoch = data_epoch + 1 WHERE id = ?",
      params: [userId],
    },
    {
      sql: "SELECT snapshot_date FROM snapshots WHERE user_id = ?",
      params: [userId],
    },
  ]);
  let deletedSnapshots = 0;
  for (const row of snaps?.rows ?? []) {
    const date = row.snapshot_date as string;
    await store?.delete(snapshotKey(userId, date));
    await executor.batch([
      {
        sql: "DELETE FROM snapshots WHERE user_id = ? AND snapshot_date = ?",
        params: [userId, date],
      },
    ]);
    deletedSnapshots++;
  }
  return { deletedRows: Number(count?.rows[0]?.n ?? 0), deletedSnapshots };
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
  const result = await deleteUserData(deps.executor, deps.store, auth.userId);
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
