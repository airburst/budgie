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

const windowStartOf = (now: number, limit: RateLimit) =>
  Math.floor(now / limit.windowMs) * limit.windowMs;

const retryAfterOf = (windowStart: number, limit: RateLimit, now: number) =>
  Math.max(1, Math.ceil((windowStart + limit.windowMs - now) / 1000));

/**
 * Count one use of `bucket` and refuse if that makes it exceed the limit: a
 * single upsert statement that returns the new count, so concurrent requests
 * cannot both pass a stale check. Used for per-user device codes (authenticated,
 * so one write per request is bounded by the number of devices).
 */
export async function consumeAttempt(
  executor: SqlExecutor,
  bucket: string,
  limit: RateLimit,
  now: number,
): Promise<void> {
  const windowStart = windowStartOf(now, limit);
  const [res] = await executor.batch([
    {
      sql: `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
            ON CONFLICT (bucket) DO UPDATE SET
              count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
              window_start = excluded.window_start
            RETURNING count`,
      params: [bucket, windowStart],
    },
  ]);
  if (Number(res?.rows[0]?.count ?? 0) > limit.max) {
    throw new ApiError("rate_limited", {
      retryAfter: retryAfterOf(windowStart, limit, now),
    });
  }
}

/**
 * Failed-enrolment limiter that costs the database almost nothing.
 *
 * Failures are counted in Worker memory (a synchronous, hence atomic, count per
 * isolate). Only when an IP reaches the limit does the isolate write ONE marker
 * row for that IP and window (`rate_limits`, the upsert's WHERE makes a repeat
 * in the same window a no-op, so at most one row write per IP per window), and
 * every enrolment first looks for that marker (a read), so the block holds
 * across isolates. A flood of failures from many IPs below the limit writes
 * nothing; a flood past the limit is stopped from memory without touching D1.
 * `markerBudgetPerHour` caps marker writes per isolate so a botnet cannot burn
 * the daily write quota this way either.
 */
export class FailedAttemptGuard {
  private windows = new Map<string, { start: number; count: number }>();
  private budget = { hour: -1, used: 0 };

  constructor(
    readonly limit: RateLimit = ENROL_FAIL_LIMIT,
    private markerBudgetPerHour = 60,
    private maxEntries = 10_000,
  ) {}

  /** Seconds to wait if this isolate already saw the limit reached in this window. */
  blockedFor(ip: string, now: number): number | null {
    const start = windowStartOf(now, this.limit);
    const w = this.windows.get(ip);
    if (w && w.start === start && w.count >= this.limit.max) {
      return retryAfterOf(start, this.limit, now);
    }
    return null;
  }

  /** Count a failure; true when this one reaches the limit. */
  recordFailure(ip: string, now: number): boolean {
    const start = windowStartOf(now, this.limit);
    let w = this.windows.get(ip);
    if (!w || w.start !== start) {
      if (this.windows.size >= this.maxEntries) this.prune(start);
      w = { start, count: 0 };
      this.windows.set(ip, w);
    }
    w.count++;
    return w.count === this.limit.max;
  }

  takeMarkerBudget(now: number): boolean {
    const hour = Math.floor(now / 3_600_000);
    if (this.budget.hour !== hour) this.budget = { hour, used: 0 };
    if (this.budget.used >= this.markerBudgetPerHour) return false;
    this.budget.used++;
    return true;
  }

  private prune(currentStart: number) {
    for (const [ip, w] of this.windows) {
      if (w.start !== currentStart) this.windows.delete(ip);
    }
    if (this.windows.size >= this.maxEntries) this.windows.clear();
  }
}

const markerBucket = (ip: string) => `enrol:ip:${ip}`;

/** Throw `rate_limited` if this IP is blocked here or by a marker another isolate wrote. */
export async function assertEnrolAllowed(
  executor: SqlExecutor,
  guard: FailedAttemptGuard,
  ip: string,
  now: number,
): Promise<void> {
  const mem = guard.blockedFor(ip, now);
  if (mem !== null) throw new ApiError("rate_limited", { retryAfter: mem });
  const start = windowStartOf(now, guard.limit);
  const [res] = await executor.batch([
    {
      sql: "SELECT 1 AS blocked FROM rate_limits WHERE bucket = ? AND window_start = ?",
      params: [markerBucket(ip), start],
    },
  ]);
  if (res && res.rows.length > 0) {
    throw new ApiError("rate_limited", {
      retryAfter: retryAfterOf(start, guard.limit, now),
    });
  }
}

/** Record a failed enrolment; writes the shared marker only when the limit is reached. */
export async function recordEnrolFailure(
  executor: SqlExecutor,
  guard: FailedAttemptGuard,
  ip: string,
  now: number,
): Promise<void> {
  if (!guard.recordFailure(ip, now) || !guard.takeMarkerBudget(now)) return;
  const start = windowStartOf(now, guard.limit);
  await executor.batch([
    {
      sql: `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, ?)
            ON CONFLICT (bucket) DO UPDATE SET
              window_start = excluded.window_start, count = excluded.count
            WHERE rate_limits.window_start < excluded.window_start`,
      params: [markerBucket(ip), start, guard.limit.max],
    },
  ]);
}

/** Delete rate-limit rows from windows that ended more than a day ago. */
export async function pruneRateLimits(
  executor: SqlExecutor,
  now: number,
): Promise<void> {
  await executor.batch([
    {
      sql: "DELETE FROM rate_limits WHERE window_start < ?",
      params: [now - 86_400_000],
    },
  ]);
}
