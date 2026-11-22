// Outgoing half of a sync round (SPEC.md 10.1 and 10.2): seal dirty rows,
// encode them as envelopes in apply order, and split them into requests.

import type { DatabaseRow, DatabaseTransaction } from "@/platform/database";
import {
  loadPublicIdLookup,
  PORTABLE_TABLES,
  type PortableTable,
} from "@/services/portable-data";
import { encodeSyncRow } from "@/services/sync/codec";
import { EnvelopeTooLargeError } from "@/services/sync/errors";
import { sealHlcFromUpdatedAt } from "@/services/sync/hlc";
import { pairTransferLegs } from "@/services/sync/transfers";
import {
  toOutgoingEnvelope,
  type SyncEnvelope,
  type SyncPayload,
} from "@/services/sync/payload";
import {
  collectDirtyTombstoneEnvelopes,
  sealDirtyTombstones,
} from "@/services/sync/tombstones";

/** Server limits (SPEC.md 2.2 and 9.3). */
export const MAX_PUSH_ENVELOPES = 500;
export const MAX_REQUEST_BYTES = 1_048_576;
/** Room for `{"formatVersion":..,"cursor":"..","push":[]}` around the push. */
const REQUEST_OVERHEAD_BYTES = 512;

type SealCandidate = DatabaseRow & {
  id: number;
  hlc: string | null;
  updated_at: string | null;
};

/**
 * Seals one row (SPEC.md 7.3) and returns its new HLC. The engine-write
 * marker keeps the triggers from treating this as an edit.
 */
export const sealRow = async (
  transaction: DatabaseTransaction,
  table: PortableTable,
  row: SealCandidate,
  deviceId: string,
  nowMs: number,
): Promise<string> => {
  const hlc = sealHlcFromUpdatedAt(row.hlc, deviceId, row.updated_at, nowMs);
  await transaction.execute({
    sql: `UPDATE ${table} SET hlc = ?, sync_unsealed = 0, sync_rev = sync_rev + 1
      WHERE id = ? AND sync_unsealed = 1`,
    params: [hlc, row.id],
  });
  return hlc;
};

/**
 * Seals every unsealed (and therefore dirty) row of every synced table,
 * including the tombstone store.
 */
export const sealDirtyRows = async (
  transaction: DatabaseTransaction,
  deviceId: string,
  nowMs: number,
): Promise<number> => {
  let sealed = 0;
  for (const table of PORTABLE_TABLES) {
    const rows = await transaction.query<SealCandidate>({
      sql: `SELECT id, hlc, updated_at FROM ${table} WHERE sync_unsealed = 1 ORDER BY id`,
    });
    for (const row of rows) {
      await sealRow(transaction, table, row, deviceId, nowMs);
      sealed++;
    }
  }
  return sealed + (await sealDirtyTombstones(transaction, deviceId, nowMs));
};

/** Categories with their parents first (SPEC.md 10.2), stable otherwise. */
const parentsFirst = (envelopes: SyncEnvelope[]): SyncEnvelope[] => {
  const byId = new Map(envelopes.map((e) => [e.publicId, e]));
  const depth = new Map<string, number>();
  const depthOf = (e: SyncEnvelope, seen: Set<string>): number => {
    const known = depth.get(e.publicId);
    if (known !== undefined) return known;
    const parentId = e.payload.parentPublicId;
    const parent = typeof parentId === "string" ? byId.get(parentId) : undefined;
    const result =
      parent && !seen.has(parent.publicId)
        ? depthOf(parent, new Set([...seen, e.publicId])) + 1
        : 0;
    depth.set(e.publicId, result);
    return result;
  };
  return envelopes
    .map((e, index) => ({ e, index, depth: depthOf(e, new Set()) }))
    .sort((a, b) => a.depth - b.depth || a.index - b.index)
    .map(({ e }) => e);
};

/**
 * Every dirty row as an envelope, in table apply order (SPEC.md 8.4), with
 * category parents before children. Call after `sealDirtyRows`, in the same
 * transaction, so every dirty row has an HLC.
 */
export const collectDirtyEnvelopes = async (
  transaction: DatabaseTransaction,
): Promise<SyncEnvelope[]> => {
  const envelopes: SyncEnvelope[] = [];
  for (const table of PORTABLE_TABLES) {
    const rows = await transaction.query<DatabaseRow & { hlc: string | null }>(
      { sql: `SELECT * FROM ${table} WHERE sync_dirty = 1 ORDER BY id` },
    );
    // Rows in the tombstone store (SPEC.md 8.10) follow their table's rows.
    const stored = await collectDirtyTombstoneEnvelopes(transaction, table);
    if (rows.length === 0) {
      envelopes.push(...stored);
      continue;
    }
    const publicIdOf = await loadPublicIdLookup(transaction, table, rows);
    const encoded = rows.map((row) => {
      if (row.hlc === null) {
        throw new Error(`Dirty ${table} row ${String(row.id)} has no HLC`);
      }
      const payload = encodeSyncRow(table, row, publicIdOf) as SyncPayload;
      return toOutgoingEnvelope(table, row.hlc, payload);
    });
    envelopes.push(
      ...(table === "categories" ? parentsFirst(encoded) : encoded),
      ...stored,
    );
  }
  return envelopes;
};

/**
 * Envelopes that must travel in the same request: the two legs of a transfer
 * (SPEC.md 8.8, see transfers.ts). Every other envelope is its own unit.
 */
export const groupPushUnits = (envelopes: SyncEnvelope[]): SyncEnvelope[][] =>
  pairTransferLegs(envelopes);

const encoder = new TextEncoder();
const byteLength = (value: unknown) =>
  encoder.encode(JSON.stringify(value)).length;

export type ChunkLimits = { maxEnvelopes: number; maxBytes: number };

/**
 * Splits the push into requests of at most `maxEnvelopes` envelopes that fit
 * the body cap, keeping order and never splitting a unit.
 */
export const chunkPush = (
  units: SyncEnvelope[][],
  limits: ChunkLimits = {
    maxEnvelopes: MAX_PUSH_ENVELOPES,
    maxBytes: MAX_REQUEST_BYTES,
  },
): SyncEnvelope[][] => {
  const budget = limits.maxBytes - REQUEST_OVERHEAD_BYTES;
  const chunks: SyncEnvelope[][] = [];
  let current: SyncEnvelope[] = [];
  let currentBytes = 0;
  for (const unit of units) {
    // One byte per separating comma.
    const sizes = unit.map((e) => byteLength(e) + 1);
    const unitBytes = sizes.reduce((sum, size) => sum + size, 0);
    if (unitBytes > budget || unit.length > limits.maxEnvelopes) {
      const first = unit[0] as SyncEnvelope;
      throw new EnvelopeTooLargeError(first.tbl, first.publicId, unitBytes);
    }
    if (
      current.length + unit.length > limits.maxEnvelopes ||
      currentBytes + unitBytes > budget
    ) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(...unit);
    currentBytes += unitBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
};
