import { sha256Hex } from "./crypto";
import type { SqlExecutor } from "./executor";
import { pruneRateLimits } from "./rate-limit";
import { snapshotKey, type SnapshotStore } from "./store";

// Daily snapshots (SPEC 12, plan section 9). A snapshot is a portable data
// package, format 1 (src/services/portable-data.ts), built from the stored
// payloads.
//
// CPU: the free plan allows 10 ms per cron run and waiting on D1 or R2 is free,
// so D1 builds each collection's JSON (json_group_array over the stored payload
// text, in chunks to stay under D1's 2 MB value limit) and the Worker only
// concatenates strings, parses once, stringifies once and hashes.

export const RETENTION_DAYS = 30;
const CHUNK_ROWS = 300;
const APPLICATION_VERSION = "budgie-sync-server";
const MINIMUM_READER_VERSION = "1.0.0";

/** Sync `tbl` -> portable collection name, in PortableData key order. Checked against tables.json in tests. */
export const COLLECTIONS: readonly (readonly [string, string])[] = [
  ["accounts", "accounts"],
  ["categories", "categories"],
  ["transactions", "transactions"],
  ["account_reconciliations", "accountReconciliations"],
  ["scheduled_transactions", "scheduledTransactions"],
  ["payees", "payees"],
  ["envelopes", "envelopes"],
  ["envelope_categories", "envelopeCategories"],
  ["budget_allocations", "budgetAllocations"],
  ["budget_transfers", "budgetTransfers"],
];

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The package text for one user, or null if the user has no rows.
 *
 * Checksum: portable-data.ts verifies SHA-256 of
 * JSON.stringify(JSON.parse(document)) with manifest.checksum set to "". The
 * stored payloads are client bytes and may not survive a parse and stringify
 * unchanged (`1.0`, `é` escapes, `1e2`), so the hash cannot be computed
 * from the concatenated text alone. We parse once and stringify once, hash that
 * canonical text, and emit it with the checksum filled in. Cost is linear in
 * the data size on the Worker's CPU: measure on staging (plan section 12).
 */
export async function buildSnapshot(
  executor: SqlExecutor,
  userId: string,
  now: number,
): Promise<string | null> {
  return (await buildSnapshotAt(executor, userId, now))?.text ?? null;
}

/** As buildSnapshot, also returning the data epoch the rows were read under. */
export async function buildSnapshotAt(
  executor: SqlExecutor,
  userId: string,
  now: number,
): Promise<{ text: string; epoch: number } | null> {
  const [epochRes, res] = await executor.batch([
    { sql: "SELECT data_epoch FROM users WHERE id = ?", params: [userId] },
    {
      sql: `SELECT tbl, chunk, json_group_array(json(doc)) AS arr
            FROM (
              SELECT tbl,
                     (row_number() OVER (PARTITION BY tbl ORDER BY public_id) - 1) / ${CHUNK_ROWS} AS chunk,
                     CASE WHEN tbl = 'accounts'
                          THEN json_set(json(payload),
                                        '$.pendingReconcileBalance', json('null'),
                                        '$.pendingReconcileDate', json('null'))
                          ELSE payload END AS doc
              FROM changes WHERE user_id = ?
            )
            GROUP BY tbl, chunk
            ORDER BY tbl, chunk`,
      params: [userId],
    },
  ]);
  const rows = res?.rows ?? [];
  if (rows.length === 0 || !epochRes?.rows[0]) return null;
  const epoch = Number(epochRes.rows[0].data_epoch);

  const byTable = new Map<string, string[]>();
  for (const r of rows) {
    const arr = r.arr as string;
    const list = byTable.get(r.tbl as string) ?? [];
    list.push(arr.slice(1, -1)); // strip [ ]
    byTable.set(r.tbl as string, list);
  }

  const manifest = JSON.stringify({
    formatVersion: 1,
    applicationVersion: APPLICATION_VERSION,
    exportedAt: new Date(now).toISOString(),
    minimumReaderVersion: MINIMUM_READER_VERSION,
    checksum: "",
  });
  const parts = COLLECTIONS.map(
    ([tbl, name]) => `"${name}":[${(byTable.get(tbl) ?? []).join(",")}]`,
  );
  const draft = `{"manifest":${manifest},"preferences":{},${parts.join(",")}}`;

  const canonical = JSON.stringify(JSON.parse(draft));
  const checksum = await sha256Hex(canonical);
  // `"checksum":""` first occurs in the manifest, which is the first key.
  return {
    text: canonical.replace('"checksum":""', `"checksum":"${checksum}"`),
    epoch,
  };
}

export interface SnapshotRunResult {
  date: string;
  users: number;
  written: number;
  /** Not written because the user's data was deleted meanwhile. */
  skipped: number;
  failed: number;
  removed: number;
}

/** Write today's snapshot for every user with data, then drop old ones. */
export async function runSnapshots(
  executor: SqlExecutor,
  store: SnapshotStore,
  now: number,
  log: (line: string) => void = () => {},
): Promise<SnapshotRunResult> {
  const date = utcDate(now);
  const result: SnapshotRunResult = {
    date,
    users: 0,
    written: 0,
    skipped: 0,
    failed: 0,
    removed: 0,
  };
  const [usersRes] = await executor.batch([
    { sql: "SELECT DISTINCT user_id FROM changes" },
  ]);
  for (const row of usersRes?.rows ?? []) {
    const userId = row.user_id as string;
    result.users++;
    try {
      const built = await buildSnapshotAt(executor, userId, now);
      if (built === null) continue;
      const key = snapshotKey(userId, date);
      // 1. Index first, and only if the user's data epoch is still the one the
      //    rows were read under: a delete-data after the read bumped it, so
      //    nothing is indexed or written for the deleted data.
      const [indexed] = await executor.batch([
        {
          sql: `INSERT INTO snapshots (user_id, snapshot_date, size, created_at)
                SELECT ?, ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND data_epoch = ?)
                ON CONFLICT (user_id, snapshot_date)
                DO UPDATE SET size = excluded.size, created_at = excluded.created_at`,
          params: [
            userId,
            date,
            new TextEncoder().encode(built.text).length,
            now,
            userId,
            built.epoch,
          ],
        },
      ]);
      if (!indexed || indexed.changes === 0) {
        result.skipped++;
        continue;
      }
      // 2. Put, then confirm the index row survived. delete-data removes index
      //    rows in the same transaction that deletes the data, before it
      //    deletes objects, so if the row is gone the delete has run and may
      //    have missed this object: remove it. If the row is still there, any
      //    later delete will find it (index and key prefix).
      await store.put(key, built.text);
      const [still] = await executor.batch([
        {
          sql: "SELECT 1 AS ok FROM snapshots WHERE user_id = ? AND snapshot_date = ?",
          params: [userId, date],
        },
      ]);
      if (!still || still.rows.length === 0) {
        await store.delete(key);
        result.skipped++;
        continue;
      }
      result.written++;
    } catch (error) {
      // No payloads, no error message (it can echo data).
      result.failed++;
      log(
        JSON.stringify({
          job: "snapshot",
          userId,
          reason: error instanceof Error ? error.name : "unknown",
        }),
      );
    }
  }
  result.removed = await pruneSnapshots(executor, store, now, log);
  await pruneRateLimits(executor, now);
  log(JSON.stringify({ job: "snapshot", ...result }));
  return result;
}

/** Remove snapshots older than the retention window (30 days including today). */
export async function pruneSnapshots(
  executor: SqlExecutor,
  store: SnapshotStore,
  now: number,
  log: (line: string) => void = () => {},
): Promise<number> {
  const cutoff = utcDate(now - (RETENTION_DAYS - 1) * 86_400_000);
  const [old] = await executor.batch([
    {
      sql: "SELECT user_id, snapshot_date FROM snapshots WHERE snapshot_date < ?",
      params: [cutoff],
    },
  ]);
  let removed = 0;
  for (const r of old?.rows ?? []) {
    const userId = r.user_id as string;
    const date = r.snapshot_date as string;
    try {
      await store.delete(snapshotKey(userId, date));
      await executor.batch([
        {
          sql: "DELETE FROM snapshots WHERE user_id = ? AND snapshot_date = ?",
          params: [userId, date],
        },
      ]);
      removed++;
    } catch (error) {
      log(
        JSON.stringify({
          job: "snapshot-prune",
          userId,
          reason: error instanceof Error ? error.name : "unknown",
        }),
      );
    }
  }
  return removed;
}
