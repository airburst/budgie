import { findUserId } from "./admin-ops";
import type { SqlExecutor } from "./executor";
import { snapshotKey, type SnapshotStore } from "./store";

export interface SnapshotInfo {
  date: string;
  size: number;
}

/** Dates and sizes of a user's snapshots, oldest first (read from the D1 index). */
export async function listSnapshots(
  executor: SqlExecutor,
  userName: string,
): Promise<SnapshotInfo[]> {
  const userId = await findUserId(executor, userName);
  const [res] = await executor.batch([
    {
      sql: "SELECT snapshot_date, size FROM snapshots WHERE user_id = ? ORDER BY snapshot_date",
      params: [userId],
    },
  ]);
  return (res?.rows ?? []).map((r) => ({
    date: r.snapshot_date as string,
    size: Number(r.size),
  }));
}

/** The snapshot file text, exactly as stored. */
export async function getSnapshot(
  executor: SqlExecutor,
  store: SnapshotStore,
  userName: string,
  date: string,
): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("The date must look like 2026-11-22");
  }
  const userId = await findUserId(executor, userName);
  const text = await store.get(snapshotKey(userId, date));
  if (text === null)
    throw new Error(`No snapshot for "${userName}" on ${date}`);
  return text;
}
