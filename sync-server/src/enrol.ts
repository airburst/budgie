import { ApiError, jsonResponse } from "./errors";
import type { SqlExecutor } from "./executor";
import { readJsonBody } from "./http";
import { generateToken, hashCode, hashToken } from "./crypto";
import {
  assertEnrolAllowed,
  clientIp,
  FailedAttemptGuard,
  recordEnrolFailure,
} from "./rate-limit";

// Used only when a caller supplies no guard (the Worker and the tests do).
const fallbackGuard = new FailedAttemptGuard();

/**
 * POST /v1/enrol (SPEC 9.2). Consumes an invite or device code and creates a
 * device in one batch: if the code is unknown, used or expired the UPDATE
 * matches nothing, the INSERT ... SELECT finds no row, and nothing is created.
 */
export async function handleEnrol(
  request: Request,
  deps: {
    executor: SqlExecutor;
    now: () => number;
    enrolGuard?: FailedAttemptGuard;
  },
): Promise<Response> {
  const { executor } = deps;
  const now = deps.now();
  const ip = clientIp(request);
  const guard = deps.enrolGuard ?? fallbackGuard;
  await assertEnrolAllowed(executor, guard, ip, now);

  const body = await readJsonBody(request);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("bad_request");
  }
  const { code, deviceName } = body as Record<string, unknown>;
  if (typeof code !== "string" || typeof deviceName !== "string") {
    throw new ApiError("bad_request");
  }
  const name = deviceName.trim();
  if (name.length < 1 || name.length > 100 || code.trim() === "") {
    throw new ApiError("bad_request");
  }

  const deviceId = crypto.randomUUID();
  const token = generateToken();
  const codeHash = await hashCode(code);

  const results = await executor.batch([
    {
      sql: `UPDATE enrol_codes SET used_at = ?, used_by_device = ?
            WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?`,
      params: [now, deviceId, codeHash, now],
    },
    {
      sql: `INSERT INTO devices (id, user_id, name, token_hash, created_at)
            SELECT ?, user_id, ?, ?, ? FROM enrol_codes
            WHERE code_hash = ? AND used_by_device = ?`,
      params: [deviceId, name, await hashToken(token), now, codeHash, deviceId],
    },
    {
      sql: `SELECT d.id AS id,
                   EXISTS (SELECT 1 FROM changes c WHERE c.user_id = d.user_id) AS has_data
            FROM devices d WHERE d.id = ?`,
      params: [deviceId],
    },
  ]);

  const row = results[2]?.rows[0];
  if (!row) {
    await recordEnrolFailure(executor, guard, ip, now);
    throw new ApiError("bad_code");
  }
  return jsonResponse(
    { deviceId, token, hasData: Number(row.has_data) === 1 },
    201,
  );
}
