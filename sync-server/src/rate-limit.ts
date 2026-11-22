import { ApiError } from "./errors";
import type { SqlExecutor } from "./executor";

export interface RateLimit {
  max: number;
  windowMs: number;
}

/** Failed enrolment attempts per IP (SPEC 2.5). Recorded in the README. */
export const ENROL_FAIL_LIMIT: RateLimit = { max: 10, windowMs: 15 * 60_000 };

/** Device codes issued per user (SPEC 2.5): 5 per 10 minutes. */
export const DEVICE_CODE_LIMIT: RateLimit = { max: 5, windowMs: 10 * 60_000 };

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

/** Throws `rate_limited` if the bucket has used up its attempts in the current window. */
export async function assertNotLimited(
  executor: SqlExecutor,
  bucket: string,
  limit: RateLimit,
  now: number,
): Promise<void> {
  const windowStart = Math.floor(now / limit.windowMs) * limit.windowMs;
  const [res] = await executor.batch([
    {
      sql: "SELECT count FROM rate_limits WHERE bucket = ? AND window_start = ?",
      params: [bucket, windowStart],
    },
  ]);
  const count = Number(res?.rows[0]?.count ?? 0);
  if (count >= limit.max) {
    const retryAfter = Math.max(
      1,
      Math.ceil((windowStart + limit.windowMs - now) / 1000),
    );
    throw new ApiError("rate_limited", { retryAfter });
  }
}

/** Count one attempt in the current fixed window. */
export async function recordAttempt(
  executor: SqlExecutor,
  bucket: string,
  limit: RateLimit,
  now: number,
): Promise<void> {
  const windowStart = Math.floor(now / limit.windowMs) * limit.windowMs;
  await executor.batch([
    {
      sql: `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
            ON CONFLICT (bucket) DO UPDATE SET
              count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
              window_start = excluded.window_start`,
      params: [bucket, windowStart],
    },
  ]);
}
