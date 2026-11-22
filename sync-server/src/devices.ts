import { authenticate } from "./auth";
import { DEVICE_CODE_LENGTH, generateCode, hashCode } from "./crypto";
import { ApiError, jsonResponse } from "./errors";
import type { SqlExecutor } from "./executor";
import type { LogContext } from "./log";
import {
  assertNotLimited,
  DEVICE_CODE_LIMIT,
  recordAttempt,
} from "./rate-limit";

export const DEVICE_CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

export interface DeviceDeps {
  executor: SqlExecutor;
  now: () => number;
  ctx?: LogContext;
  /** Injectable for tests. */
  generateCode?: () => string;
}

/** POST /v1/devices/code (SPEC 9.4). */
export async function handleDeviceCode(
  request: Request,
  deps: DeviceDeps,
): Promise<Response> {
  const { executor } = deps;
  const auth = await authenticate(executor, request, deps.now(), deps.ctx);
  const now = deps.now();
  const bucket = `devcode:user:${auth.userId}`;
  await assertNotLimited(executor, bucket, DEVICE_CODE_LIMIT, now);
  await recordAttempt(executor, bucket, DEVICE_CODE_LIMIT, now);

  const generate =
    deps.generateCode ?? (() => generateCode(DEVICE_CODE_LENGTH));
  const expiresAt = now + DEVICE_CODE_TTL_MS;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generate();
    try {
      // Conditional on the caller still being active: a revoke that landed
      // after authentication must not be followed by a new code.
      const [ins, dev] = await executor.batch([
        {
          sql: `INSERT INTO enrol_codes (code_hash, user_id, kind, created_at, expires_at)
                SELECT ?, ?, 'device', ?, ?
                WHERE EXISTS (SELECT 1 FROM devices WHERE id = ? AND revoked_at IS NULL)`,
          params: [
            await hashCode(code),
            auth.userId,
            now,
            expiresAt,
            auth.deviceId,
          ],
        },
        {
          sql: "SELECT revoked_at FROM devices WHERE id = ?",
          params: [auth.deviceId],
        },
      ]);
      if (ins?.changes === 0) {
        const revokedAt = dev?.rows[0]?.revoked_at;
        throw new ApiError(
          revokedAt === null || revokedAt === undefined
            ? "bad_token"
            : "revoked",
        );
      }
    } catch (error) {
      // A hash collision (never reissue a stored code): try another code.
      if (
        error instanceof Error &&
        /enrol_codes\.code_hash/.test(error.message)
      ) {
        continue;
      }
      throw error;
    }
    return jsonResponse(
      { code, expiresAt: new Date(expiresAt).toISOString() },
      201,
    );
  }
  throw new Error("could not generate an unused device code");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const iso = (ms: unknown) =>
  ms === null || ms === undefined ? null : new Date(Number(ms)).toISOString();

/** GET /v1/devices (SPEC 9.5): the caller's active devices, oldest first. */
export async function handleListDevices(
  request: Request,
  deps: DeviceDeps,
): Promise<Response> {
  const auth = await authenticate(deps.executor, request, deps.now(), deps.ctx);
  const [res] = await deps.executor.batch([
    {
      sql: `SELECT id, name, created_at, last_seen_at FROM devices
            WHERE user_id = ? AND revoked_at IS NULL
            ORDER BY created_at, id`,
      params: [auth.userId],
    },
  ]);
  return jsonResponse({
    devices: (res?.rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: iso(r.created_at),
      lastSeenAt: iso(r.last_seen_at),
      current: r.id === auth.deviceId,
    })),
  });
}

/** DELETE /v1/devices/:id (SPEC 9.6). */
export async function handleRevokeDevice(
  request: Request,
  deps: DeviceDeps,
  deviceId: string,
): Promise<Response> {
  const auth = await authenticate(deps.executor, request, deps.now(), deps.ctx);
  if (!UUID.test(deviceId)) throw new ApiError("bad_request");
  // Conditional on the caller still being active (a revoke after
  // authentication must not be followed by this one).
  const [res, caller] = await deps.executor.batch([
    {
      sql: `UPDATE devices SET revoked_at = ?
            WHERE id = ? AND user_id = ? AND revoked_at IS NULL
              AND EXISTS (SELECT 1 FROM devices WHERE id = ? AND revoked_at IS NULL)`,
      params: [deps.now(), deviceId, auth.userId, auth.deviceId],
    },
    {
      sql: "SELECT revoked_at FROM devices WHERE id = ?",
      params: [auth.deviceId],
    },
  ]);
  // A device may revoke itself, so success is decided by the UPDATE first.
  if (res && res.changes === 1) return new Response(null, { status: 204 });
  const callerRevoked = caller?.rows[0]?.revoked_at;
  if (callerRevoked !== null && callerRevoked !== undefined) {
    throw new ApiError("revoked");
  }
  // Unknown, another user's and already revoked all look the same.
  throw new ApiError("not_found");
}
