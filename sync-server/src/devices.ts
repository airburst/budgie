import { authenticate } from "./auth";
import { DEVICE_CODE_LENGTH, generateCode, hashCode } from "./crypto";
import { ApiError, jsonResponse } from "./errors";
import type { SqlExecutor } from "./executor";
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
  /** Injectable for tests. */
  generateCode?: () => string;
}

/** POST /v1/devices/code (SPEC 9.4). */
export async function handleDeviceCode(
  request: Request,
  deps: DeviceDeps,
): Promise<Response> {
  const { executor } = deps;
  const auth = await authenticate(executor, request, deps.now());
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
      await executor.batch([
        {
          sql: `INSERT INTO enrol_codes (code_hash, user_id, kind, created_at, expires_at)
                VALUES (?, ?, 'device', ?, ?)`,
          params: [await hashCode(code), auth.userId, now, expiresAt],
        },
      ]);
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
  const auth = await authenticate(deps.executor, request, deps.now());
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
  const auth = await authenticate(deps.executor, request, deps.now());
  if (!UUID.test(deviceId)) throw new ApiError("bad_request");
  const [res] = await deps.executor.batch([
    {
      sql: `UPDATE devices SET revoked_at = ?
            WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
      params: [deps.now(), deviceId, auth.userId],
    },
  ]);
  // Unknown, another user's and already revoked all look the same.
  if (!res || res.changes !== 1) throw new ApiError("not_found");
  return new Response(null, { status: 204 });
}
