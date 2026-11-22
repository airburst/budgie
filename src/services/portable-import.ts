// Portable import: replaces the local data with a portable package (an
// export, or a server snapshot, SY-019). Every row of the package is written
// as a user write; every local row the package does not hold ends deleted.
//
// With sync off, rows keep exactly the `updatedAt` the package gives them,
// and are left for Start (SPEC.md 11.1) to normalise and mark.
//
// While synced (story SY-034), the import is a local edit of every row it
// writes or removes, made at the moment of the import, so that every device
// ends with exactly the imported data:
//   - rows the import removes are marked deleted and dirty, including rows
//     that were already deleted but have been synced (a delete re-asserted
//     now beats an undelete this device has not seen yet) and their copies
//     in the tombstone store (SY-029). Rows never synced and already deleted
//     (the old rows Join leaves behind) are not touched: they were never
//     sent and are not sent now;
//   - every dirty row is brought to the wire contract the way Start does it
//     (`sync/normalise.ts`: canonical UUID ids, contract formats) and checked
//     to encode to a valid envelope; the import fails otherwise;
//   - every unsealed row is sealed in the import transaction with the time
//     of the import as its edit time (SPEC.md 7.3), not the package's
//     `updatedAt`. A backup is usually older than the versions it replaces;
//     sealing from its `updatedAt` would only beat the versions this device
//     has seen (the increment), and lose to edits made elsewhere before the
//     import but not yet pulled here.
// This module sits outside `portable-data.ts` because it uses the sync
// engine, which itself depends on `portable-data.ts`.

import type {
  DatabaseCapability,
  DatabaseTransaction,
} from "@/platform/database";
import {
  applyPortableRow,
  createReferenceResolver,
  importPreferences,
  placePortableRow,
  PORTABLE_COLLECTIONS,
  PORTABLE_TABLES,
  resolveSecondPassReferences,
  verifyPortableData,
  type PortableRowFor,
} from "@/services/portable-data";
import {
  normaliseRowsForSync,
  validateRowsForSync,
} from "@/services/sync/normalise";
import { toTimestamp } from "@/services/sync/payload";
import { sealDirtyRows } from "@/services/sync/push";
import { isNaturalKeyTable } from "@/services/tombstone-store";

export type ImportPortableDataOptions = {
  /** Clock in milliseconds since the Unix epoch; defaults to `Date.now`. */
  now?: () => number;
};

/**
 * How the import writes a package row: as a user write (dirty and unsealed,
 * HLC untouched) that keeps the package's `updated_at`. Left to the update
 * trigger, a write would get `updated_at = CURRENT_TIMESTAMP` whenever it
 * leaves the column unchanged: always in the second pass (category parents,
 * transfer links), and in the first when the package's value equals the
 * stored one. So the write marks the row itself and bumps `sync_rev`, which
 * tells the trigger to leave it alone. An insert is not affected
 * (`incrementColumns` only apply to an existing row; the insert trigger
 * keeps a given `updated_at`). `placePortableRow` does the same.
 */
const USER_WRITE = {
  extraColumns: { sync_dirty: 1, sync_unsealed: 1 },
  incrementColumns: ["sync_rev"],
} as const;

/** Tables whose rows also carry the legacy `deleted` flag. */
const LEGACY_DELETED_FLAG = new Set(["accounts", "categories"]);

/** This device's id if sync is on (enabled and started), else null. */
const syncingDeviceId = async (
  transaction: DatabaseTransaction,
): Promise<string | null> => {
  const [state] = await transaction.query<{
    device_id: string | null;
    enabled: number;
    cursor: string | null;
  }>({ sql: "SELECT device_id, enabled, cursor FROM sync_state WHERE id = 1" });
  return state?.enabled === 1 && state.device_id && state.cursor !== null
    ? state.device_id
    : null;
};

/** Marks every local row deleted before the package is written. */
const removeLocalRows = async (
  transaction: DatabaseTransaction,
  syncing: boolean,
  nowTs: string,
) => {
  if (!syncing) {
    for (const table of PORTABLE_TABLES) {
      await transaction.execute({
        sql: `UPDATE ${table} SET deleted_at = CURRENT_TIMESTAMP`,
      });
    }
    await transaction.execute({ sql: "UPDATE accounts SET deleted = 1" });
    await transaction.execute({ sql: "UPDATE categories SET deleted = 1" });
    return;
  }
  // User writes: the triggers mark each row dirty and unsealed and bump its
  // `updated_at`. An earlier delete keeps its time.
  for (const table of PORTABLE_TABLES) {
    await transaction.execute({
      sql: `UPDATE ${table} SET deleted_at = COALESCE(deleted_at, ?)${
        LEGACY_DELETED_FLAG.has(table) ? ", deleted = 1" : ""
      } WHERE deleted_at IS NULL OR hlc IS NOT NULL`,
      params: [nowTs],
    });
  }
  // Stored rows are deleted already; re-assert the synced ones the same way.
  await transaction.execute({
    sql: "UPDATE sync_tombstones SET dirty = 1, unsealed = 1 WHERE hlc IS NOT NULL",
  });
};

export const importPortableData = async (
  database: DatabaseCapability,
  value: unknown,
  options: ImportPortableDataOptions = {},
) => {
  const data = await verifyPortableData(value);
  const now = options.now ?? Date.now;

  await database.transaction(async (transaction) => {
    const deviceId = await syncingDeviceId(transaction);
    const nowMs = now();
    const nowTs = toTimestamp(nowMs);
    await removeLocalRows(transaction, deviceId !== null, nowTs);

    const resolver = createReferenceResolver(transaction);
    for (const table of PORTABLE_TABLES) {
      const rows = data[PORTABLE_COLLECTIONS[table]] as Array<
        PortableRowFor[typeof table]
      >;
      for (const row of rows) {
        // Natural-key tables can hold a deleted and a live row with one key
        // (a server snapshot can): the deleted one goes to the store.
        if (isNaturalKeyTable(table)) {
          await placePortableRow(transaction, table, row as never, {
            resolver,
          });
          continue;
        }
        await applyPortableRow(transaction, table, row as never, {
          resolver,
          deferSecondPass: true,
          ...USER_WRITE,
        });
      }
      for (const row of rows) {
        await resolveSecondPassReferences(transaction, table, row as never, {
          resolver,
          ...USER_WRITE,
        });
      }
      await resolver.preload(table);
    }
    await importPreferences(transaction, data.preferences);

    if (deviceId === null) return;
    await normaliseRowsForSync(transaction, { nowTs, scope: "dirty" });
    await validateRowsForSync(transaction, "dirty");
    await sealDirtyRows(transaction, deviceId, nowMs, nowMs);
  });
};
