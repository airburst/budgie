import type { DatabaseRow, DatabaseTransaction } from "@/platform/database";
import {
  applyPortableRow,
  resolveSecondPassReferences,
  toPortableRow,
  type ApplyPortableRowOptions,
  type PortableRowFor,
  type PortableTable,
  type PublicIdLookup,
  type ResolveSecondPassOptions,
} from "@/services/portable-data";

/**
 * Fields of the portable row that never travel in a sync payload
 * (SPEC.md 5.4, `neverSent` in tables.json). A half-finished reconciliation
 * stays on its device.
 */
export const SYNC_NEVER_SENT: Partial<
  Record<PortableTable, readonly string[]>
> = {
  accounts: ["pendingReconcileBalance", "pendingReconcileDate"],
};

const neverSent = (table: PortableTable) => SYNC_NEVER_SENT[table] ?? [];

/** Database row to sync payload: the portable row minus never-sent fields. */
export const encodeSyncRow = <T extends PortableTable>(
  table: T,
  row: DatabaseRow,
  publicIdOf: PublicIdLookup,
): Partial<PortableRowFor[T]> => {
  const portable: Record<string, unknown> = {
    ...toPortableRow(table, row, publicIdOf),
  };
  for (const field of neverSent(table)) delete portable[field];
  return portable as Partial<PortableRowFor[T]>;
};

/**
 * Pass 1 of applying a pulled payload: upserts by public id, leaves the
 * never-sent fields at their local values, ignores unknown fields and writes
 * the two second-pass references as NULL. Follow with
 * `resolveSyncSecondPass` once every row of the pull is written.
 * `extraColumns` lets the engine write its own columns (`hlc`, clean state)
 * in the same statement.
 */
export const applySyncRow = <T extends PortableTable>(
  transaction: DatabaseTransaction,
  table: T,
  payload: Partial<PortableRowFor[T]> & { publicId: string },
  options: Omit<ApplyPortableRowOptions, "skipFields" | "deferSecondPass"> = {},
) =>
  applyPortableRow(transaction, table, payload as PortableRowFor[T], {
    ...options,
    skipFields: neverSent(table),
    deferSecondPass: true,
  });

/** Pass 2: resolves `parentPublicId` / `transferTransactionPublicId`. */
export const resolveSyncSecondPass = <T extends PortableTable>(
  transaction: DatabaseTransaction,
  table: T,
  payload: Partial<PortableRowFor[T]> & { publicId: string },
  options: Omit<ResolveSecondPassOptions, "skipFields"> = {},
) =>
  resolveSecondPassReferences(
    transaction,
    table,
    payload as PortableRowFor[T],
    { ...options, skipFields: neverSent(table) },
  );
