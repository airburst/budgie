import { authenticate } from "./auth";
import { ApiError } from "./errors";
import type { SqlExecutor } from "./executor";
import type { LogContext } from "./log";
import { parseJson } from "./http";
import { rawPushPayloads, ScanError } from "./json-ranges";

// POST /v1/sync (SPEC 9.3, section 12).

export const TABLES = [
  "accounts",
  "categories",
  "envelopes",
  "transactions",
  "account_reconciliations",
  "scheduled_transactions",
  "payees",
  "envelope_categories",
  "budget_allocations",
  "budget_transfers",
] as const;
const TABLE_SET: ReadonlySet<string> = new Set(TABLES);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HLC =
  /^[0-9]{15}:[0-9]{5}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const MAX_ENVELOPES = 500;
export const DRIFT_LIMIT_MS = 300_000;
export const DEFAULT_PAGE_SIZE = 500;

export interface SyncDeps {
  executor: SqlExecutor;
  now: () => number;
  pageSize?: number;
  ctx?: LogContext;
}

interface PushEnvelope {
  tbl: string;
  publicId: string;
  hlc: string;
  deleted: boolean;
  /** Exact text of the payload as received. */
  payload: string;
}

interface Cursor {
  epoch: number | null; // null for "0"
  seq: number;
  tbl: string;
  publicId: string;
}

// Sorts after every table name and before nothing, so "(seq, ~, '')" means
// "everything with this seq has been seen".
const AFTER_ALL_TABLES = "~";

function parseCursor(value: unknown): Cursor {
  if (typeof value !== "string") throw new ApiError("bad_request");
  if (value === "0") return { epoch: null, seq: 0, tbl: "", publicId: "" };
  const parts = value.split(":");
  const num = /^(0|[1-9][0-9]{0,15})$/;
  if (
    (parts.length !== 2 && parts.length !== 4) ||
    !num.test(parts[0] as string) ||
    !num.test(parts[1] as string)
  ) {
    throw new ApiError("bad_request");
  }
  const epoch = Number(parts[0]);
  const seq = Number(parts[1]);
  if (parts.length === 2) {
    return { epoch, seq, tbl: AFTER_ALL_TABLES, publicId: "" };
  }
  const tbl = parts[2] as string;
  const publicId = parts[3] as string;
  if (!TABLE_SET.has(tbl) || !UUID.test(publicId)) {
    throw new ApiError("bad_request");
  }
  return { epoch, seq, tbl, publicId };
}

function parseRequest(text: string): {
  formatVersion: number;
  cursor: Cursor;
  push: PushEnvelope[];
} {
  const body = parseJson(text);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("bad_request");
  }
  const { formatVersion, cursor, push } = body as Record<string, unknown>;
  if (
    typeof formatVersion !== "number" ||
    !Number.isInteger(formatVersion) ||
    formatVersion < 1 ||
    !Array.isArray(push)
  ) {
    throw new ApiError("bad_request");
  }
  if (push.length > MAX_ENVELOPES) throw new ApiError("too_many_envelopes");
  const parsedCursor = parseCursor(cursor);
  const seen = new Set<string>();
  const envelopes = push.map((item: unknown): PushEnvelope => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new ApiError("bad_request");
    }
    const e = item as Record<string, unknown>;
    if (
      typeof e.tbl !== "string" ||
      !TABLE_SET.has(e.tbl) ||
      typeof e.publicId !== "string" ||
      !UUID.test(e.publicId) ||
      typeof e.hlc !== "string" ||
      !HLC.test(e.hlc) ||
      typeof e.deleted !== "boolean" ||
      typeof e.payload !== "object" ||
      e.payload === null ||
      Array.isArray(e.payload)
    ) {
      throw new ApiError("bad_request");
    }
    const key = `${e.tbl}/${e.publicId}`;
    if (seen.has(key)) throw new ApiError("bad_request");
    seen.add(key);
    return {
      tbl: e.tbl,
      publicId: e.publicId,
      hlc: e.hlc,
      deleted: e.deleted,
      payload: "", // the exact text is attached after authentication
    };
  });
  return { formatVersion, cursor: parsedCursor, push: envelopes };
}

/** Fill in each envelope's exact payload text from the request body. */
function attachRawPayloads(text: string, push: PushEnvelope[]): void {
  let raw: string[];
  try {
    raw = rawPushPayloads(text);
  } catch (error) {
    if (error instanceof ScanError) throw new ApiError("bad_request");
    throw error;
  }
  if (raw.length !== push.length) throw new ApiError("bad_request");
  push.forEach((e, i) => {
    e.payload = raw[i] as string;
  });
}

function hlcWall(hlc: string): number {
  return Number(hlc.slice(0, 15));
}

export async function handleSync(
  request: Request,
  deps: SyncDeps,
): Promise<Response> {
  const { executor } = deps;
  const pageSize = deps.pageSize ?? DEFAULT_PAGE_SIZE;
  const text = await request.text();

  // SPEC 2.4 order: schema, then token, then endpoint rules.
  const req = parseRequest(text);
  const auth = await authenticate(executor, request, deps.now(), deps.ctx);

  if (req.formatVersion < auth.maxFormatVersion) {
    throw new ApiError("format_too_old", {
      formatVersion: auth.maxFormatVersion,
    });
  }
  if (req.cursor.epoch !== null && req.cursor.epoch !== auth.dataEpoch) {
    throw new ApiError("data_reset");
  }

  // Authenticated: only now do the O(n) raw-text scan and the re-encoding.
  attachRawPayloads(text, req.push);

  const nowMs = deps.now();
  const maxWall = nowMs + DRIFT_LIMIT_MS;
  const pushJson = JSON.stringify(req.push);

  // The auth read above is a separate batch, so a delete-data, revoke or
  // format bump can land after it. Every statement below therefore re-checks,
  // inside the one transaction, that the device is still active, the user's
  // data epoch is still the one this request was validated against and no newer
  // format version exists. If not, nothing is written or returned, and the
  // read-back (statement 4) tells us which condition failed.
  const active = `EXISTS (SELECT 1 FROM users WHERE id = ? AND data_epoch = ? AND max_format_version <= ?)
                  AND EXISTS (SELECT 1 FROM devices WHERE id = ? AND revoked_at IS NULL)`;
  const activeParams = [
    auth.userId,
    auth.dataEpoch,
    req.formatVersion,
    auth.deviceId,
  ];

  const [, upsert, page, state] = await executor.batch([
    // 1. Bump the user's sequence once per request, raise max_format_version.
    {
      sql: `UPDATE users
            SET seq = seq + 1,
                max_format_version = MAX(max_format_version, ?)
            WHERE id = ? AND data_epoch = ? AND max_format_version <= ?
              AND EXISTS (SELECT 1 FROM devices WHERE id = ? AND revoked_at IS NULL)`,
      params: [
        req.formatVersion,
        auth.userId,
        auth.dataEpoch,
        req.formatVersion,
        auth.deviceId,
      ],
    },
    // 2. Upsert the pushed envelopes. The payload travels as a JSON string
    //    inside the parameter, so json_extract returns it unchanged.
    {
      sql: `INSERT INTO changes (user_id, tbl, public_id, hlc, deleted, payload, device_id, seq)
            SELECT ?, json_extract(e.value, '$.tbl'), json_extract(e.value, '$.publicId'),
                   json_extract(e.value, '$.hlc'), json_extract(e.value, '$.deleted'),
                   json_extract(e.value, '$.payload'), ?,
                   (SELECT seq FROM users WHERE id = ?)
            FROM json_each(?) AS e
            WHERE CAST(substr(json_extract(e.value, '$.hlc'), 1, 15) AS INTEGER) <= ?
              AND ${active}
            ON CONFLICT (user_id, tbl, public_id) DO UPDATE SET
              hlc = excluded.hlc, deleted = excluded.deleted, payload = excluded.payload,
              device_id = excluded.device_id, seq = excluded.seq
            WHERE excluded.hlc > changes.hlc
            RETURNING tbl, public_id`,
      params: [
        auth.userId,
        auth.deviceId,
        auth.userId,
        pushJson,
        maxWall,
        ...activeParams,
      ],
    },
    // 3. The next page after the cursor, written by other devices.
    {
      sql: `SELECT tbl, public_id, hlc, deleted, payload, seq FROM changes
            WHERE user_id = ? AND device_id != ? AND ${active}
              AND (seq, tbl, public_id) > (?, ?, ?)
            ORDER BY seq, tbl, public_id
            LIMIT ?`,
      params: [
        auth.userId,
        auth.deviceId,
        ...activeParams,
        req.cursor.seq,
        req.cursor.tbl,
        req.cursor.publicId,
        pageSize + 1,
      ],
    },
    // 4. Read back the counters.
    {
      sql: `SELECT u.seq AS seq, u.max_format_version AS max_format_version,
                   u.data_epoch AS data_epoch,
                   (SELECT revoked_at FROM devices WHERE id = ?) AS revoked_at
            FROM users u WHERE u.id = ?`,
      params: [auth.deviceId, auth.userId],
    },
  ]);

  const st = state?.rows[0];
  if (!st) throw new ApiError("bad_token");
  if (st.revoked_at !== null && st.revoked_at !== undefined) {
    throw new ApiError("revoked");
  }
  if (Number(st.data_epoch) !== auth.dataEpoch)
    throw new ApiError("data_reset");
  if (Number(st.max_format_version) > req.formatVersion) {
    throw new ApiError("format_too_old", {
      formatVersion: Number(st.max_format_version),
    });
  }

  const stored = new Set(
    (upsert?.rows ?? []).map(
      (r) => `${r.tbl as string}/${r.public_id as string}`,
    ),
  );
  const rejected = req.push
    .filter((e) => !stored.has(`${e.tbl}/${e.publicId}`))
    .map((e) => ({
      tbl: e.tbl,
      publicId: e.publicId,
      reason: hlcWall(e.hlc) > maxWall ? "drift" : "stale",
    }));

  const allRows = page?.rows ?? [];
  const more = allRows.length > pageSize;
  const rows = more ? allRows.slice(0, pageSize) : allRows;
  const last = rows[rows.length - 1];
  const userSeq = Number(state?.rows[0]?.seq ?? 0);
  const cursor =
    more && last
      ? `${auth.dataEpoch}:${Number(last.seq)}:${last.tbl as string}:${last.public_id as string}`
      : `${auth.dataEpoch}:${userSeq}`;

  if (deps.ctx) {
    deps.ctx.counts = {
      pushed: req.push.length,
      accepted: stored.size,
      stale: rejected.filter((r) => r.reason === "stale").length,
      drift: rejected.filter((r) => r.reason === "drift").length,
      pulled: rows.length,
    };
  }

  // Payloads are spliced in as stored text so they come back unchanged.
  const pull = rows
    .map(
      (r) =>
        `{"tbl":${JSON.stringify(r.tbl)},"publicId":${JSON.stringify(r.public_id)},` +
        `"hlc":${JSON.stringify(r.hlc)},"deleted":${Number(r.deleted) === 1},` +
        `"payload":${r.payload as string}}`,
    )
    .join(",");
  const body =
    `{"formatVersion":${Number(state?.rows[0]?.max_format_version ?? req.formatVersion)},` +
    `"cursor":${JSON.stringify(cursor)},"more":${more},"pull":[${pull}],` +
    `"rejected":${JSON.stringify(rejected)}}`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
