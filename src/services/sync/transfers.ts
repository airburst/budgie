// Transfer pairs (SPEC.md 8.8): a transfer is two `transactions` rows that
// point at each other through `transferTransactionPublicId`.
//
// Pushing: `groupPushUnits` (push.ts) uses `pairTransferLegs` so both legs
// travel in one request. Applying: `repairHalfDeletedTransfers` is an
// after-apply hook that deletes a live leg whose partner is deleted.

import type { AfterApplyHook } from "@/services/sync/engine";
import { toTimestamp, type SyncEnvelope } from "@/services/sync/payload";
import { sealRow } from "@/services/sync/push";

/**
 * Groups envelopes into units that must share a request. Two legs of a
 * transfer that are both in `envelopes` form one unit, placed where the
 * first leg was (so apply order between tables is kept). Every other
 * envelope is its own unit.
 *
 * A leg whose partner is not in `envelopes` (the partner is clean and
 * already on the server) travels alone: SPEC.md 8.8 only constrains the
 * legs that are pushed, and dragging a clean row in would need it sealed
 * with a new HLC, which is an edit nobody made.
 */
export const pairTransferLegs = (
  envelopes: SyncEnvelope[],
): SyncEnvelope[][] => {
  const legs = new Map<string, SyncEnvelope>();
  for (const e of envelopes) {
    if (e.tbl === "transactions") legs.set(e.publicId, e);
  }
  const partnerOf = (e: SyncEnvelope): SyncEnvelope | undefined => {
    if (e.tbl !== "transactions") return undefined;
    const partnerId = e.payload.transferTransactionPublicId;
    if (typeof partnerId !== "string" || partnerId === e.publicId) {
      return undefined;
    }
    return legs.get(partnerId);
  };
  const placed = new Set<string>();
  const units: SyncEnvelope[][] = [];
  for (const e of envelopes) {
    if (placed.has(`${e.tbl}/${e.publicId}`)) continue;
    placed.add(`${e.tbl}/${e.publicId}`);
    const unit = [e];
    // Follow the chain of links (normally one hop, back to `e`).
    let next = partnerOf(e);
    while (next && !placed.has(`${next.tbl}/${next.publicId}`)) {
      placed.add(`${next.tbl}/${next.publicId}`);
      unit.push(next);
      next = partnerOf(next);
    }
    units.push(unit);
  }
  return units;
};

/**
 * SPEC.md 8.8: after apply, a live leg whose partner is deleted is deleted
 * too, as a local edit: `deletedAt` and `updatedAt` are the engine clock, the
 * row stays dirty and is sealed at once, so the next round pushes it.
 * The transfer link is left as it is.
 */
export const repairHalfDeletedTransfers: AfterApplyHook = async (
  transaction,
  { deviceId, nowMs },
) => {
  const orphans = await transaction.query<{ id: number; hlc: string | null }>({
    sql: `SELECT leg.id, leg.hlc
      FROM transactions leg
      JOIN transactions partner ON partner.id = leg.transfer_transaction_id
      WHERE leg.deleted_at IS NULL AND partner.deleted_at IS NOT NULL
      ORDER BY leg.id`,
  });
  const at = toTimestamp(nowMs);
  for (const leg of orphans) {
    await transaction.execute({
      sql: `UPDATE transactions
        SET deleted_at = ?, updated_at = ?, sync_dirty = 1, sync_unsealed = 1,
          sync_rev = sync_rev + 1
        WHERE id = ?`,
      params: [at, at, leg.id],
    });
    await sealRow(
      transaction,
      "transactions",
      { id: leg.id, hlc: leg.hlc, updated_at: at },
      deviceId,
      nowMs,
    );
  }
};
