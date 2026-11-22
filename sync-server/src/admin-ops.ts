import type { SqlExecutor } from "./executor";

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
