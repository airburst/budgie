import { ApiError } from "./errors";

/** Body cap for every request (SPEC 2.2). */
export const BODY_CAP_BYTES = 1_048_576;

/**
 * Read a request body as text, refusing more than the cap with
 * `413 body_too_large` before parsing. Checks Content-Length first, then counts
 * bytes while streaming so a missing or false header cannot get past it.
 */
export async function readCappedBody(
  request: Request,
  cap = BODY_CAP_BYTES,
): Promise<string | null> {
  if (!request.body) return null;
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > cap) {
    throw new ApiError("body_too_large");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new ApiError("body_too_large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/**
 * Per-IP request limiter held in Worker memory: a fixed window per IP, no
 * database write. Each isolate counts separately, so the real ceiling is the
 * limit times the number of live isolates; it is a best-effort brake on a
 * runaway client, not an exact quota. Returns retryAfter seconds when limited.
 */
export class MemoryIpLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private max = 120,
    private windowMs = 60_000,
    private maxEntries = 10_000,
  ) {}

  check(ip: string, now: number): number | null {
    const start = Math.floor(now / this.windowMs) * this.windowMs;
    let w = this.windows.get(ip);
    if (!w || w.start !== start) {
      if (this.windows.size >= this.maxEntries) this.prune(start);
      w = { start, count: 0 };
      this.windows.set(ip, w);
    }
    w.count++;
    if (w.count > this.max) {
      return Math.max(1, Math.ceil((start + this.windowMs - now) / 1000));
    }
    return null;
  }

  private prune(currentStart: number): void {
    for (const [ip, w] of this.windows) {
      if (w.start !== currentStart) this.windows.delete(ip);
    }
    if (this.windows.size >= this.maxEntries) this.windows.clear();
  }
}

/** D1 free-plan daily quota errors. The exact message is not documented by Cloudflare. */
export function isDailyLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /daily\s+(read|write|row|limit|quota)|(exceeded|reached).{0,40}daily|daily.{0,40}(exceeded|reached)|free tier limit/i.test(
    message,
  );
}

/** Seconds until the next 00:00 UTC. */
export function secondsToUtcMidnight(now: number): number {
  const day = 86_400_000;
  return Math.max(1, Math.ceil((day - (now % day)) / 1000));
}
