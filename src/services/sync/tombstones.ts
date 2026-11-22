// The sync cycle's view of the tombstone store (migration 0015): a stored row
// is sealed, pushed and acknowledged exactly like a row of its table
// (SPEC.md 8.3, 10.1 and 10.4). The store keeps no `sync_rev`: only the engine
// and portable import write it, never a user edit through the triggers.

import type { DatabaseTransaction } from "@/platform/database";
import type { PortableTable } from "@/services/portable-data";
import { sealHlcFromUpdatedAt } from "@/services/sync/hlc";
import {
  toOutgoingEnvelope,
  type SyncEnvelope,
  type SyncPayload,
} from "@/services/sync/payload";
import {
  isNaturalKeyTable,
  NATURAL_KEY_TABLES,
  readTombstones,
  type StoredTombstone,
} from "@/services/tombstone-store";

/** Seals one stored row (SPEC.md 7.3) and returns its new HLC. */
export const sealTombstone = async (
  transaction: DatabaseTransaction,
  tombstone: StoredTombstone,
  deviceId: string,
  nowMs: number,
): Promise<string> => {
  const updatedAt = tombstone.payload.updatedAt;
  const hlc = sealHlcFromUpdatedAt(
    tombstone.hlc,
    deviceId,
    typeof updatedAt === "string" ? updatedAt : null,
    nowMs,
  );
  await transaction.execute({
    sql: `UPDATE sync_tombstones SET hlc = ?, unsealed = 0
      WHERE tbl = ? AND public_id = ? AND unsealed = 1`,
    params: [hlc, tombstone.tbl, tombstone.publicId],
  });
  return hlc;
};

/** Seals every unsealed stored row. */
export const sealDirtyTombstones = async (
  transaction: DatabaseTransaction,
  deviceId: string,
  nowMs: number,
): Promise<number> => {
  let sealed = 0;
  for (const table of NATURAL_KEY_TABLES) {
    for (const tombstone of await readTombstones(transaction, table, {
      unsealed: true,
    })) {
      await sealTombstone(transaction, tombstone, deviceId, nowMs);
      sealed++;
    }
  }
  return sealed;
};

/** Every dirty stored row of `table` as an envelope. Call after sealing. */
export const collectDirtyTombstoneEnvelopes = async (
  transaction: DatabaseTransaction,
  table: PortableTable,
): Promise<SyncEnvelope[]> =>
  (await readTombstones(transaction, table, { dirty: true })).map(
    (tombstone) => {
      if (tombstone.hlc === null) {
        throw new Error(
          `Dirty stored ${table} row ${tombstone.publicId} has no HLC`,
        );
      }
      return toOutgoingEnvelope(
        table,
        tombstone.hlc,
        tombstone.payload as SyncPayload,
      );
    },
  );

/** Acknowledge (SPEC.md 10.4) for a pushed row now in the store. */
export const acknowledgeTombstone = async (
  transaction: DatabaseTransaction,
  envelope: SyncEnvelope,
): Promise<void> => {
  if (!isNaturalKeyTable(envelope.tbl)) return;
  await transaction.execute({
    sql: `UPDATE sync_tombstones SET dirty = 0
      WHERE tbl = ? AND public_id = ? AND hlc = ? AND dirty = 1 AND unsealed = 0`,
    params: [envelope.tbl, envelope.publicId, envelope.hlc],
  });
};

/** Dirty stored rows, with the state `countUnsettled` in the engine needs. */
export const dirtyTombstones = async (
  transaction: Pick<DatabaseTransaction, "query">,
  table: PortableTable,
): Promise<Array<{ public_id: string; hlc: string | null; sync_unsealed: number }>> =>
  (await readTombstones(transaction, table, { dirty: true })).map(
    (tombstone) => ({
      public_id: tombstone.publicId,
      hlc: tombstone.hlc,
      sync_unsealed: Number(tombstone.unsealed),
    }),
  );
