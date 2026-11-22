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
  const auth = await authenticate(executor, request);
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
