// Incoming half of a sync round (SPEC.md 8.2 to 8.7, 10.3 and 10.4): buffer
// the pull, apply it in dependency order with the second pass, and
// acknowledge the push. Everything here runs inside the caller's single
// apply transaction.

import type { DatabaseRow, DatabaseTransaction } from "@/platform/database";
import {
  createReferenceResolver,
  PORTABLE_TABLES,
  type PortableTable,
} from "@/services/portable-data";
import { applySyncRow, resolveSyncSecondPass } from "@/services/sync/codec";
import { InvalidEnvelopeError } from "@/services/sync/errors";
import { compareHlc } from "@/services/sync/hlc";
import {
  envelopeProblem,
  normaliseIncomingPayload,
  type SyncEnvelope,
  type SyncPayload,
  type SyncRejection,
} from "@/services/sync/payload";
import { applyNaturalKeyEnvelopes } from "@/services/sync/natural-keys";
import { sealRow } from "@/services/sync/push";
import { acknowledgeTombstone } from "@/services/sync/tombstones";
import { isNaturalKeyTable } from "@/services/tombstone-store";

/** Every engine write bumps this marker so the triggers leave it alone. */
const ENGINE_WRITE = ["sync_rev"] as const;

const keyOf = (tbl: string, publicId: string) => `${tbl}/${publicId}`;

/**
 * Validates every pulled envelope (SPEC.md 8.7) and keeps, per
 * `(tbl, publicId)`, the one with the highest HLC (10.2).
 */
export const bufferPull = (pulled: readonly unknown[]): SyncEnvelope[] => {
  const kept = new Map<string, SyncEnvelope>();
  for (const value of pulled) {
    const problem = envelopeProblem(value);
    if (problem !== null) {
      const e = (value ?? {}) as Record<string, unknown>;
      throw new InvalidEnvelopeError(
        typeof e.tbl === "string" ? e.tbl : null,
        typeof e.publicId === "string" ? e.publicId : null,
        problem,
      );
    }
    const envelope = value as SyncEnvelope;
    const key = keyOf(envelope.tbl, envelope.publicId);
    const existing = kept.get(key);
    if (!existing || compareHlc(envelope.hlc, existing.hlc) > 0) {
      kept.set(key, envelope);
    }
  }
  return [...kept.values()];
};

/** One row written by pass 1, with the payload as stored. */
export type AppliedRow = { envelope: SyncEnvelope; payload: SyncPayload };

type LocalState = DatabaseRow & {
  id: number;
  hlc: string | null;
  updated_at: string | null;
  sync_unsealed: number;
};

/**
 * Applies a buffered pull: pass 1 table by table in apply order, then pass 2
 * for the self-references (SPEC.md 8.5). Throws `MissingReferenceError` if a
 * reference does not resolve; the caller rolls back.
 */
export const applyPull = async (
  transaction: DatabaseTransaction,
  envelopes: readonly SyncEnvelope[],
  context: { deviceId: string; nowMs: number },
): Promise<AppliedRow[]> => {
  const resolver = createReferenceResolver(transaction);
  const applied: AppliedRow[] = [];

  for (const table of PORTABLE_TABLES) {
    // payees, envelope_categories and budget_allocations go through
    // natural-key resolution and the tombstone store (SPEC.md 8.10).
    if (isNaturalKeyTable(table)) {
      applied.push(
        ...(await applyNaturalKeyEnvelopes(
          transaction,
          table,
          envelopes.filter((envelope) => envelope.tbl === table),
          { ...context, resolver },
        )),
      );
      continue;
    }
    for (const envelope of envelopes) {
      if (envelope.tbl !== table) continue;
      const [local] = await transaction.query<LocalState>({
        sql: `SELECT id, hlc, updated_at, sync_unsealed FROM ${table} WHERE public_id = ?`,
        params: [envelope.publicId],
      });
      let localHlc = local?.hlc ?? null;
      // 8.2 step 1: a local edit is sealed before it is compared.
      if (local && local.sync_unsealed === 1) {
        localHlc = await sealRow(
          transaction,
          table,
          local,
          context.deviceId,
          context.nowMs,
        );
      }
      if (local && compareHlc(localHlc, envelope.hlc) >= 0) continue;

      const payload = normaliseIncomingPayload(envelope);
      await applySyncRow(transaction, table, payload, {
        resolver,
        extraColumns: { hlc: envelope.hlc, sync_dirty: 0, sync_unsealed: 0 },
        incrementColumns: ENGINE_WRITE,
        publicIdConflictOnly: true,
      });
      applied.push({ envelope, payload });
    }
  }

  for (const { envelope, payload } of applied) {
    await resolveSyncSecondPass(transaction, envelope.tbl, payload, {
      resolver,
      incrementColumns: ENGINE_WRITE,
    });
  }
  return applied;
};

/**
 * Acknowledges the push (SPEC.md 10.4): stored and `stale` clear dirty, but
 * only where the row is still exactly the pushed version (8.3); `drift`
 * leaves the row dirty.
 */
export const acknowledgePush = async (
  transaction: DatabaseTransaction,
  pushed: readonly SyncEnvelope[],
  rejected: readonly SyncRejection[],
): Promise<void> => {
  const drift = new Set(
    rejected
      .filter((r) => r.reason === "drift")
      .map((r) => keyOf(r.tbl, r.publicId)),
  );
  for (const envelope of pushed) {
    if (drift.has(keyOf(envelope.tbl, envelope.publicId))) continue;
    await transaction.execute({
      sql: `UPDATE ${envelope.tbl} SET sync_dirty = 0, sync_rev = sync_rev + 1
        WHERE public_id = ? AND hlc = ? AND sync_dirty = 1 AND sync_unsealed = 0`,
      params: [envelope.publicId, envelope.hlc],
    });
    await acknowledgeTombstone(transaction, envelope);
  }
};

/** Per-table counts, every table present. */
export const countByTable = (
  envelopes: Iterable<{ tbl: PortableTable }>,
): Record<PortableTable, number> => {
  const counts = Object.fromEntries(
    PORTABLE_TABLES.map((table) => [table, 0]),
  ) as Record<PortableTable, number>;
  for (const { tbl } of envelopes) counts[tbl]++;
  return counts;
};
