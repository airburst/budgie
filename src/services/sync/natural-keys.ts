// Pass 1 for the three natural-key tables (SPEC.md 8.2 step 4 and 8.10):
// last-write-wins decides which incoming versions apply, then every key with
// two or more live claimants is resolved as one set. The lowest public id
// keeps the key, the claimant with the highest HLC supplies the content, and
// every other claimant becomes a deleted version of itself, dirty and sealed
// at once (an engine edit, pushed by the next round). Rows are written with
// `placePortableRow`, which keeps deleted rows that would block a key in the
// tombstone store (migration 0015), so an apply never fails on a UNIQUE
// constraint.

import type { DatabaseRow, DatabaseTransaction } from "@/platform/database";
import {
  findNaturalKeyHolder,
  loadPublicIdLookup,
  placePortableRow,
  type ReferenceResolver,
} from "@/services/portable-data";
import { encodeSyncRow } from "@/services/sync/codec";
import { compareHlc, sealHlcFromUpdatedAt } from "@/services/sync/hlc";
import {
  normaliseIncomingPayload,
  toTimestamp,
  type SyncEnvelope,
  type SyncPayload,
} from "@/services/sync/payload";
import { sealRow } from "@/services/sync/push";
import { sealTombstone } from "@/services/sync/tombstones";
import {
  NATURAL_KEYS,
  readTombstone,
  type NaturalKeyTable,
} from "@/services/tombstone-store";

/** One version of a row that may claim a key. `envelope` is null for a local row. */
type Claimant = {
  publicId: string;
  hlc: string | null;
  payload: SyncPayload;
  envelope: SyncEnvelope | null;
};

/** What a row ends up as after this apply, if it is written at all. */
type Outcome = Claimant & { dirty: boolean };

type LocalState = DatabaseRow & {
  id: number;
  hlc: string | null;
  updated_at: string | null;
  sync_unsealed: number;
};

const keyOf = (table: NaturalKeyTable, payload: SyncPayload) =>
  JSON.stringify(NATURAL_KEYS[table].key.map((field) => payload[field] ?? null));

const contentOf = (table: NaturalKeyTable, payload: SyncPayload) =>
  Object.fromEntries(
    NATURAL_KEYS[table].content.map((field) => [field, payload[field] ?? null]),
  );

/** Newest first; ties by lowest public id (SPEC.md 8.10 rule 3). */
const bySource = (a: Claimant, b: Claimant) =>
  compareHlc(b.hlc, a.hlc) || (a.publicId < b.publicId ? -1 : 1);

/**
 * The local HLC of `publicId` (in its table or the store), sealed first if
 * it has an unsealed edit (SPEC.md 8.2 step 1); `undefined` if there is no
 * local row.
 */
const sealedLocalHlc = async (
  transaction: DatabaseTransaction,
  table: NaturalKeyTable,
  publicId: string,
  context: { deviceId: string; nowMs: number },
): Promise<string | null | undefined> => {
  const [local] = await transaction.query<LocalState>({
    sql: `SELECT id, hlc, updated_at, sync_unsealed FROM ${table} WHERE public_id = ?`,
    params: [publicId],
  });
  if (local) {
    return local.sync_unsealed === 1
      ? sealRow(transaction, table, local, context.deviceId, context.nowMs)
      : local.hlc;
  }
  const stored = await readTombstone(transaction, table, publicId);
  if (!stored) return undefined;
  return stored.unsealed
    ? sealTombstone(transaction, stored, context.deviceId, context.nowMs)
    : stored.hlc;
};

/**
 * Applies the pulled envelopes of one natural-key table and returns the
 * incoming envelopes that were written, each with the payload as stored.
 */
export const applyNaturalKeyEnvelopes = async (
  transaction: DatabaseTransaction,
  table: NaturalKeyTable,
  envelopes: readonly SyncEnvelope[],
  context: { deviceId: string; nowMs: number; resolver: ReferenceResolver },
): Promise<Array<{ envelope: SyncEnvelope; payload: SyncPayload }>> => {
  // 1. Last-write-wins: which incoming versions apply (SPEC.md 8.2).
  const incoming = new Map<string, Claimant>();
  for (const envelope of envelopes) {
    const localHlc = await sealedLocalHlc(
      transaction,
      table,
      envelope.publicId,
      context,
    );
    if (localHlc !== undefined && compareHlc(localHlc, envelope.hlc) >= 0) {
      continue;
    }
    incoming.set(envelope.publicId, {
      publicId: envelope.publicId,
      hlc: envelope.hlc,
      payload: normaliseIncomingPayload(envelope),
      envelope,
    });
  }

  // 2. Group the live rows that will exist by key: incoming live versions,
  // plus the local live row holding that key unless it is being overwritten.
  // Local live rows never collide with each other (the UNIQUE constraint),
  // so every group has an incoming member.
  const groups = new Map<string, Claimant[]>();
  for (const claimant of incoming.values()) {
    if (claimant.payload.deletedAt !== null) continue;
    const key = keyOf(table, claimant.payload);
    groups.set(key, [...(groups.get(key) ?? []), claimant]);
  }
  for (const members of groups.values()) {
    const first = members[0] as Claimant;
    const holder = await findNaturalKeyHolder(
      transaction,
      table,
      first.payload,
      context.resolver,
    );
    if (
      !holder ||
      holder.deleted_at !== null ||
      holder.public_id === null ||
      incoming.has(holder.public_id)
    ) {
      continue;
    }
    // All claimants are sealed before they are compared.
    const hlc =
      holder.sync_unsealed === 1
        ? await sealRow(
            transaction,
            table,
            holder,
            context.deviceId,
            context.nowMs,
          )
        : holder.hlc;
    const publicIdOf = await loadPublicIdLookup(transaction, table, [holder]);
    members.push({
      publicId: holder.public_id,
      hlc,
      payload: encodeSyncRow(table, holder, publicIdOf) as SyncPayload,
      envelope: null,
    });
  }

  // 3. Resolve each group as one set (SPEC.md 8.10 rules 2 to 4).
  const outcomes = new Map<string, Outcome>(
    [...incoming.values()].map((claimant) => [
      claimant.publicId,
      { ...claimant, dirty: false },
    ]),
  );
  const now = toTimestamp(context.nowMs);
  const engineEdit = (claimant: Claimant, payload: SyncPayload): Outcome => ({
    ...claimant,
    payload,
    hlc: sealHlcFromUpdatedAt(
      claimant.hlc,
      context.deviceId,
      now,
      context.nowMs,
    ),
    dirty: true,
  });
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const winner = members.reduce((low, member) =>
      member.publicId < low.publicId ? member : low,
    );
    const source = [...members].sort(bySource)[0] as Claimant;
    for (const loser of members) {
      if (loser === winner) continue;
      outcomes.set(
        loser.publicId,
        engineEdit(loser, {
          ...loser.payload,
          updatedAt: now,
          deletedAt: now,
        }),
      );
    }
    const content = contentOf(table, source.payload);
    if (
      source !== winner &&
      JSON.stringify(contentOf(table, winner.payload)) !==
        JSON.stringify(content)
    ) {
      outcomes.set(
        winner.publicId,
        engineEdit(winner, { ...winner.payload, ...content, updatedAt: now }),
      );
    }
  }

  // 4. Write deleted versions first, so live ones find the keys they need
  // held only by deleted rows (which step aside into the store).
  const ordered = [...outcomes.values()].sort(
    (a, b) =>
      Number(a.payload.deletedAt === null) -
      Number(b.payload.deletedAt === null),
  );
  const pending = new Set(outcomes.keys());
  for (const outcome of ordered) {
    await placePortableRow(transaction, table, outcome.payload as never, {
      resolver: context.resolver,
      state: { hlc: outcome.hlc, dirty: outcome.dirty, unsealed: false },
      pending,
    });
    pending.delete(outcome.publicId);
  }

  return ordered.flatMap((outcome) =>
    outcome.envelope
      ? [{ envelope: outcome.envelope, payload: outcome.payload }]
      : [],
  );
};
