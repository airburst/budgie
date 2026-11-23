/**
 * Hybrid logical clock (sync contract SPEC section 7). Pure functions only.
 *
 * Format: `<wall:15 digits>:<counter:5 digits>:<deviceId lowercase uuid>`.
 * Fixed widths make plain string order equal tuple order.
 */

export interface Hlc {
  /** Milliseconds since the Unix epoch, UTC. */
  wall: number;
  /** 0 to 99999. */
  counter: number;
  deviceId: string;
}

export const HLC_PATTERN =
  /^[0-9]{15}:[0-9]{5}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const HLC_MAX_COUNTER = 99999;
const MAX_WALL = 999_999_999_999_999;
const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Format an HLC. Throws RangeError on out-of-range parts. */
export function encodeHlc(hlc: Hlc): string {
  const { wall, counter, deviceId } = hlc;
  if (!Number.isInteger(wall) || wall < 0 || wall > MAX_WALL) {
    throw new RangeError(`HLC wall out of range: ${wall}`);
  }
  if (!Number.isInteger(counter) || counter < 0 || counter > HLC_MAX_COUNTER) {
    throw new RangeError(`HLC counter out of range: ${counter}`);
  }
  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new RangeError(`HLC device id invalid: ${deviceId}`);
  }
  return `${String(wall).padStart(15, "0")}:${String(counter).padStart(5, "0")}:${deviceId}`;
}

/** Parse an HLC string; returns null for anything not matching the spec. */
export function parseHlc(text: string): Hlc | null {
  if (typeof text !== "string" || !HLC_PATTERN.test(text)) return null;
  return {
    wall: Number(text.slice(0, 15)),
    counter: Number(text.slice(16, 21)),
    deviceId: text.slice(22),
  };
}

/**
 * Compare two HLCs by code point (ASCII order). A missing HLC (null,
 * undefined) is older than any HLC; two missing HLCs are equal.
 */
export function compareHlc(
  a: string | null | undefined,
  b: string | null | undefined,
): -1 | 0 | 1 {
  if (a == null) return b == null ? 0 : -1;
  if (b == null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Convert a `YYYY-MM-DD HH:MM:SS` (UTC) text, as stored in `updatedAt`, to
 * milliseconds. Returns null when null/undefined or not in that format.
 */
export function updatedAtToMs(
  updatedAt: string | null | undefined,
): number | null {
  if (updatedAt == null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(updatedAt);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(ms);
  // Reject overflowed dates such as 2026-02-31.
  if (
    Number.isNaN(ms) ||
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d ||
    check.getUTCHours() !== h ||
    check.getUTCMinutes() !== mi ||
    check.getUTCSeconds() !== s
  ) {
    return null;
  }
  return ms;
}

/**
 * Seal rule (SPEC 7.3): the larger of `(edit, 0, D)` and the increment of the
 * current HLC. Always strictly greater than `current` when present.
 *
 * @param current  the row's current HLC string, or null/undefined if none
 * @param deviceId this device's id
 * @param editMs   wall time in ms of the row's latest local edit
 */
export function sealHlc(
  current: string | null | undefined,
  deviceId: string,
  editMs: number,
): string {
  const fromEdit = encodeHlc({ wall: editMs, counter: 0, deviceId });
  if (current == null) return fromEdit;
  const h = parseHlc(current);
  if (!h) throw new RangeError(`Invalid HLC: ${current}`);
  const increment = encodeHlc(
    h.counter === HLC_MAX_COUNTER
      ? { wall: h.wall + 1, counter: 0, deviceId }
      : { wall: h.wall, counter: h.counter + 1, deviceId },
  );
  return compareHlc(fromEdit, increment) >= 0 ? fromEdit : increment;
}

/**
 * Web convenience: seal using the row's `updatedAt` text. When `updatedAt` is
 * null (or unparseable) no edit time is known, so per the spec the current
 * clock reading `nowMs` is used.
 */
export function sealHlcFromUpdatedAt(
  current: string | null | undefined,
  deviceId: string,
  updatedAt: string | null | undefined,
  nowMs: number,
): string {
  return sealHlc(current, deviceId, updatedAtToMs(updatedAt) ?? nowMs);
}
