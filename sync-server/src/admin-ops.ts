import { deleteUserData, type DeleteResult } from "./data";
import type { SqlExecutor } from "./executor";
import type { SnapshotStore } from "./store";

export interface AdminOpsDeps {
  now?: () => number;
}

/** Revoke a device by id (admin). `revoked` is false if it was already revoked. */
export async function revokeDevice(
  executor: SqlExecutor,
  deviceId: string,
  deps: AdminOpsDeps = {},
): Promise<{ revoked: boolean }> {
  const now = (deps.now ?? Date.now)();
  const [, res] = await executor.batch([
    {
      sql: "UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
      params: [now, deviceId],
    },
    { sql: "SELECT revoked_at FROM devices WHERE id = ?", params: [deviceId] },
  ]);
  const row = res?.rows[0];
  if (!row) throw new Error(`No device "${deviceId}"`);
  // revoked_at equals `now` only if this call set it.
  return { revoked: Number(row.revoked_at) === now };
}

export async function findUserId(
  executor: SqlExecutor,
  userName: string,
): Promise<string> {
  const [res] = await executor.batch([
    { sql: "SELECT id FROM users WHERE name = ?", params: [userName.trim()] },
  ]);
  const id = res?.rows[0]?.id;
  if (typeof id !== "string") throw new Error(`No user named "${userName}"`);
  return id;
}

/**
 * Delete a user's stored rows and snapshots (same code as `DELETE /v1/data`).
 * With `removeUser` also delete the user's devices, codes and the user row.
 */
export async function adminDeleteUserData(
  executor: SqlExecutor,
  store: SnapshotStore | undefined,
  userName: string,
  options: { removeUser?: boolean } = {},
): Promise<DeleteResult & { userRemoved: boolean }> {
  const userId = await findUserId(executor, userName);
  const result = await deleteUserData(executor, store, userId);
  if (!options.removeUser) return { ...result, userRemoved: false };
  await executor.batch([
    { sql: "DELETE FROM snapshots WHERE user_id = ?", params: [userId] },
    { sql: "DELETE FROM enrol_codes WHERE user_id = ?", params: [userId] },
    { sql: "DELETE FROM devices WHERE user_id = ?", params: [userId] },
    { sql: "DELETE FROM users WHERE id = ?", params: [userId] },
  ]);
  return { ...result, userRemoved: true };
}
