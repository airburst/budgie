// Join (SPEC.md 11.2): a later app replaces its data with the user's synced
// books. Enrolment is done before this (device id and token in `sync_state`).
//
// Order of work, and why a failed join leaves the data exactly as it was:
//   1. Pull everything from cursor "0" with an EMPTY push, buffering it in
//      memory. Nothing local is written, and nothing is ever pushed, so a
//      network error, a newer format version or an invalid envelope here
//      leaves the database untouched.
//   2. In ONE transaction: mark every local row deleted without making it
//      dirty and clear its HLC (rows in the tombstone store too), apply the
//      buffered pull (natural keys per SPEC.md 8.10, so old rows sharing a
//      key with pulled ones step aside), run the after-apply hooks, remap
//      account shortcuts by public id, and store the cursor. Any failure
//      rolls all of it back.
// Pulling before marking is equivalent to the spec's order (mark, then pull):
// the server's answer does not depend on local state, the push is empty
// either way, and nothing local is visible to anyone between the two steps.
//
// The old rows stay as deleted, clean rows with no HLC: never pushed (they
// are not dirty and no engine rule edits a deleted row), and overwritten by
// any pulled version with the same public id (every HLC beats none).

import type { DatabaseCapability } from "@/platform/database";
import {
  PORTABLE_TABLES,
  remapAccountShortcuts,
} from "@/services/portable-data";
import { applyPull, bufferPull, countByTable } from "@/services/sync/apply";
import {
  readSyncState,
  type SyncCounts,
  type SyncEngineDeps,
} from "@/services/sync/engine";
import { FormatTooNewError } from "@/services/sync/errors";
import { SYNC_FORMAT_VERSION, toTimestamp } from "@/services/sync/payload";

export type SyncJoinResult = {
  /** Rows written locally from the pull, per table. */
  applied: SyncCounts;
  /** Requests sent (each with an empty push). */
  requests: number;
  /** The cursor stored after the join. */
  cursor: string;
};

/** Tables whose payload also carries the legacy `deleted` flag. */
const LEGACY_DELETED_FLAG = new Set(["accounts", "categories"]);

/**
 * Joins sync on this device (SPEC.md 11.2 steps 3 and 4). Throws, with the
 * local data unchanged, if any request or the apply fails. Run an ordinary
 * cycle afterwards to push engine edits the apply may have made (for
 * example natural-key resolution among pulled rows); none of them come from
 * the old data.
 */
export const joinSync = async (
  database: DatabaseCapability,
  deps: Pick<SyncEngineDeps, "transport" | "now" | "afterApply" | "formatVersion">,
): Promise<SyncJoinResult> => {
  const formatVersion = deps.formatVersion ?? SYNC_FORMAT_VERSION;
  const state = await readSyncState(database);

  // 1. Pull everything; push nothing.
  let cursor = "0";
  let requests = 0;
  const pulled: unknown[] = [];
  let more = true;
  while (more) {
    const response = await deps.transport(
      { formatVersion, cursor, push: [] },
      state.auth,
    );
    requests++;
    if (response.formatVersion > formatVersion) {
      throw new FormatTooNewError(response.formatVersion);
    }
    cursor = response.cursor;
    pulled.push(...response.pull);
    more = response.more;
  }
  const buffered = bufferPull(pulled);

  // 2. Replace the local data in one transaction.
  const applied = await database.transaction(async (transaction) => {
    const nowMs = deps.now();
    const deletedAt = toTimestamp(nowMs);
    for (const table of PORTABLE_TABLES) {
      await transaction.execute({
        sql: `UPDATE ${table} SET deleted_at = COALESCE(deleted_at, ?),${
          LEGACY_DELETED_FLAG.has(table) ? " deleted = 1," : ""
        } hlc = NULL, sync_dirty = 0, sync_unsealed = 0, sync_rev = sync_rev + 1`,
        params: [deletedAt],
      });
    }
    await transaction.execute({
      sql: "UPDATE sync_tombstones SET hlc = NULL, dirty = 0, unsealed = 0",
    });

    const rows = await applyPull(transaction, buffered, {
      deviceId: state.deviceId,
      nowMs,
    });
    for (const hook of deps.afterApply ?? []) {
      await hook(transaction, { deviceId: state.deviceId, nowMs, applied: rows });
    }
    await remapAccountShortcuts(transaction);
    await transaction.execute({
      sql: "UPDATE sync_state SET cursor = ? WHERE id = 1",
      params: [cursor],
    });
    return rows;
  });

  return {
    applied: countByTable(applied.map((row) => row.envelope)),
    requests,
    cursor,
  };
};
