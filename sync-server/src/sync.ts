import { authenticate } from "./auth";
import { ApiError } from "./errors";
import type { SqlExecutor } from "./executor";
import type { LogContext } from "./log";
import { parseJson } from "./http";
import { rawPushPayloads } from "./json-ranges";

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
  const raw = rawPushPayloads(text);
  const seen = new Set<string>();
  const envelopes = push.map((item: unknown, i): PushEnvelope => {
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
      payload: raw[i] as string,
    };
  });
  return { formatVersion, cursor: parsedCursor, push: envelopes };
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

  const nowMs = deps.now();
  const maxWall = nowMs + DRIFT_LIMIT_MS;
  const pushJson = JSON.stringify(req.push);

  const [, upsert, page, state] = await executor.batch([
    // 1. Bump the user's sequence once per request, raise max_format_version.
    {
      sql: `UPDATE users
            SET seq = seq + 1,
                max_format_version = MAX(max_format_version, ?)
            WHERE id = ?`,
      params: [req.formatVersion, auth.userId],
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
            ON CONFLICT (user_id, tbl, public_id) DO UPDATE SET
              hlc = excluded.hlc, deleted = excluded.deleted, payload = excluded.payload,
              device_id = excluded.device_id, seq = excluded.seq
            WHERE excluded.hlc > changes.hlc
            RETURNING tbl, public_id`,
      params: [auth.userId, auth.deviceId, auth.userId, pushJson, maxWall],
    },
    // 3. The next page after the cursor, written by other devices.
    {
      sql: `SELECT tbl, public_id, hlc, deleted, payload, seq FROM changes
            WHERE user_id = ? AND device_id != ?
              AND (seq, tbl, public_id) > (?, ?, ?)
            ORDER BY seq, tbl, public_id
            LIMIT ?`,
      params: [
        auth.userId,
        auth.deviceId,
        req.cursor.seq,
        req.cursor.tbl,
        req.cursor.publicId,
        pageSize + 1,
      ],
    },
    // 4. Read back the counters.
    {
      sql: "SELECT seq, max_format_version FROM users WHERE id = ?",
      params: [auth.userId],
    },
  ]);

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
