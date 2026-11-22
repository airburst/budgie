import { hashToken } from "./crypto";
import { ApiError } from "./errors";
import type { SqlExecutor } from "./executor";

export interface AuthContext {
  userId: string;
  deviceId: string;
  maxFormatVersion: number;
  dataEpoch: number;
}

/**
 * Resolve user and device from the bearer token only (SPEC 2.2). Throws
 * `bad_token` for a missing, malformed or unknown token and `revoked` for a
 * revoked device.
 */
export async function authenticate(
  executor: SqlExecutor,
  request: Request,
): Promise<AuthContext> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{1,128})$/i.exec(header.trim());
  if (!match) throw new ApiError("bad_token");
  const [res] = await executor.batch([
    {
      sql: `SELECT d.id AS device_id, d.user_id AS user_id, d.revoked_at AS revoked_at,
                   u.max_format_version AS max_format_version, u.data_epoch AS data_epoch
            FROM devices d JOIN users u ON u.id = d.user_id
            WHERE d.token_hash = ?`,
      params: [await hashToken(match[1] as string)],
    },
  ]);
  const row = res?.rows[0];
  if (!row) throw new ApiError("bad_token");
  if (row.revoked_at !== null && row.revoked_at !== undefined) {
    throw new ApiError("revoked");
  }
  return {
    userId: row.user_id as string,
    deviceId: row.device_id as string,
    maxFormatVersion: Number(row.max_format_version),
    dataEpoch: Number(row.data_epoch),
  };
}
