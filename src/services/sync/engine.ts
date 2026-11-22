// The client sync cycle (SPEC.md section 10) over `DatabaseCapability`.
//
// One round: seal and encode dirty rows (one transaction), push them in
// chunks and keep pulling while `more`, then in ONE transaction apply the
// whole pull, run the after-apply hooks, acknowledge the push and store the
// cursor. Any failure before or during that transaction leaves the cursor and
// the dirty rows as they were. A cycle repeats rounds while rows were left
// dirty by edits made during the round (SPEC.md 10.5).

import type {
  DatabaseCapability,
  DatabaseTransaction,
} from "@/platform/database";
import { type PortableTable, PORTABLE_TABLES } from "@/services/portable-data";
import {
  acknowledgePush,
  applyPull,
  bufferPull,
  countByTable,
  type AppliedRow,
} from "@/services/sync/apply";
import {
  FormatTooNewError,
  SyncNotConfiguredError,
  SyncNotStartedError,
} from "@/services/sync/errors";
import {
  SYNC_FORMAT_VERSION,
  type SyncEnvelope,
  type SyncRejection,
  type SyncRequest,
  type SyncResponse,
} from "@/services/sync/payload";
import {
  chunkPush,
  collectDirtyEnvelopes,
  groupPushUnits,
  MAX_PUSH_ENVELOPES,
  MAX_REQUEST_BYTES,
  sealDirtyRows,
} from "@/services/sync/push";

/** What a transport needs besides the request body. */
export type SyncAuth = { token: string; serverUrl: string | null };

/**
 * Sends one `POST /v1/sync` and returns the `200` body. Throws on anything
 * else: `SyncHttpError` for an error response, any other error for a
 * transport failure ("offline").
 */
export type SyncTransport = (
  request: SyncRequest,
  auth: SyncAuth,
) => Promise<SyncResponse>;

export type AfterApplyContext = {
  deviceId: string;
  nowMs: number;
  /** Rows written by this round's pass 1, in apply order. */
  applied: readonly AppliedRow[];
};

/**
 * Runs inside the apply transaction after pass 2 and before the push is
 * acknowledged; a throw rolls the whole apply back. Seam for the transfer
 * pair rule (SY-027) and the reconciliation check (SY-030).
 */
export type AfterApplyHook = (
  transaction: DatabaseTransaction,
  context: AfterApplyContext,
) => Promise<void>;

export type SyncEngineDeps = {
  transport: SyncTransport;
  /** Clock in milliseconds since the Unix epoch (seal fallback, engine edits). */
  now: () => number;
  afterApply?: readonly AfterApplyHook[];
  /** Defaults to SYNC_FORMAT_VERSION. */
  formatVersion?: number;
  /** Push chunk limits; default to the server's (500, 1 MiB). */
  maxEnvelopesPerRequest?: number;
  maxRequestBytes?: number;
  /** Rounds per cycle (SPEC.md 10.5 "at most a few"); default 3. */
  maxRounds?: number;
};

export type SyncCounts = Record<PortableTable, number>;

export type SyncRoundResult = {
  /** Rows written locally from the pull, per table. */
  applied: SyncCounts;
  /** Envelopes sent, per table (stored or rejected). */
  pushed: SyncCounts;
  /** Pushed envelopes the server refused. */
  rejected: SyncRejection[];
  /** Requests sent this round. */
  requests: number;
  cursor: string;
};

export type SyncCycleResult = SyncRoundResult & { rounds: number };

type SyncStateRow = {
  device_id: string | null;
  token: string | null;
  cursor: string | null;
  server_url: string | null;
};

export const readSyncState = async (database: DatabaseCapability) => {
  const [row] = await database.query<SyncStateRow>({
    sql: "SELECT device_id, token, cursor, server_url FROM sync_state WHERE id = 1",
  });
  if (!row?.device_id) throw new SyncNotConfiguredError("device id");
  if (!row.token) throw new SyncNotConfiguredError("token");
  // The cursor is NULL until Start or Join sets it to "0": the started marker.
  if (row.cursor === null) throw new SyncNotStartedError();
  return {
    deviceId: row.device_id,
    auth: { token: row.token, serverUrl: row.server_url },
    cursor: row.cursor,
  };
};

const keyOf = (e: { tbl: string; publicId: string }) => `${e.tbl}/${e.publicId}`;

/**
 * Rows still dirty after a round that this round did not settle: edited
 * while the push was in flight, made dirty by a hook, or never pushed.
 * Drift-rejected rows (pushed with the same HLC) do not count.
 */
const countUnsettled = async (
  database: DatabaseCapability,
  pushed: readonly SyncEnvelope[],
): Promise<number> => {
  const pushedHlc = new Map(pushed.map((e) => [keyOf(e), e.hlc]));
  let count = 0;
  for (const table of PORTABLE_TABLES) {
    const rows = await database.query<{
      public_id: string;
      hlc: string | null;
      sync_unsealed: number;
    }>({
      sql: `SELECT public_id, hlc, sync_unsealed FROM ${table} WHERE sync_dirty = 1`,
    });
    for (const row of rows) {
      const sent = pushedHlc.get(`${table}/${row.public_id}`);
      if (row.sync_unsealed === 1 || sent !== row.hlc) count++;
    }
  }
  return count;
};

/** One round of the cycle. See the file comment. */
export const runSyncRound = async (
  database: DatabaseCapability,
  deps: SyncEngineDeps,
): Promise<SyncRoundResult & { pushedEnvelopes: SyncEnvelope[] }> => {
  const formatVersion = deps.formatVersion ?? SYNC_FORMAT_VERSION;
  const state = await readSyncState(database);

  // 10.1 Seal and encode. Sealing is kept even if the rest fails.
  const outgoing = await database.transaction(async (transaction) => {
    await sealDirtyRows(transaction, state.deviceId, deps.now());
    return collectDirtyEnvelopes(transaction);
  });
  const chunks = chunkPush(groupPushUnits(outgoing), {
    maxEnvelopes: deps.maxEnvelopesPerRequest ?? MAX_PUSH_ENVELOPES,
    maxBytes: deps.maxRequestBytes ?? MAX_REQUEST_BYTES,
  });

  // 10.2 Push, then pull while `more`. Nothing is applied yet.
  let cursor = state.cursor;
  let requests = 0;
  const pulled: unknown[] = [];
  const rejected: SyncRejection[] = [];
  const send = async (push: SyncEnvelope[]) => {
    const response = await deps.transport(
      { formatVersion, cursor, push },
      state.auth,
    );
    requests++;
    if (response.formatVersion > formatVersion) {
      throw new FormatTooNewError(response.formatVersion);
    }
    cursor = response.cursor;
    pulled.push(...response.pull);
    rejected.push(...response.rejected);
    return response.more;
  };
  let more = true;
  for (const chunk of chunks) more = await send(chunk);
  if (chunks.length === 0) more = await send([]);
  while (more) more = await send([]);

  // 10.3 Apply, acknowledge and store the cursor in one transaction.
  const buffered = bufferPull(pulled);
  const applied = await database.transaction(async (transaction) => {
    const nowMs = deps.now();
    const rows = await applyPull(transaction, buffered, {
      deviceId: state.deviceId,
      nowMs,
    });
    for (const hook of deps.afterApply ?? []) {
      await hook(transaction, { deviceId: state.deviceId, nowMs, applied: rows });
    }
    await acknowledgePush(transaction, outgoing, rejected);
    await transaction.execute({
      sql: "UPDATE sync_state SET cursor = ? WHERE id = 1",
      params: [cursor],
    });
    return rows;
  });

  return {
    applied: countByTable(applied.map((row) => row.envelope)),
    pushed: countByTable(outgoing),
    rejected,
    requests,
    cursor,
    pushedEnvelopes: outgoing,
  };
};

const addCounts = (a: SyncCounts, b: SyncCounts): SyncCounts =>
  Object.fromEntries(
    PORTABLE_TABLES.map((table) => [table, a[table] + b[table]]),
  ) as SyncCounts;

/**
 * Runs rounds until no row is left dirty by edits made during the cycle, at
 * most `maxRounds`. Counts are summed over the rounds; `rejected` is the last
 * round's. Throws (after rolling back the failing round's apply) on any error.
 */
export const runSyncCycle = async (
  database: DatabaseCapability,
  deps: SyncEngineDeps,
): Promise<SyncCycleResult> => {
  const maxRounds = deps.maxRounds ?? 3;
  let total: SyncCycleResult | null = null;
  for (let round = 1; round <= maxRounds; round++) {
    const { pushedEnvelopes, ...result } = await runSyncRound(database, deps);
    total = total
      ? {
          ...result,
          applied: addCounts(total.applied, result.applied),
          pushed: addCounts(total.pushed, result.pushed),
          requests: total.requests + result.requests,
          rounds: round,
        }
      : { ...result, rounds: round };
    if ((await countUnsettled(database, pushedEnvelopes)) === 0) break;
  }
  return total as SyncCycleResult;
};
