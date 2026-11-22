// Start: the first app of a user turns sync on and uploads everything
// (SPEC.md 11.1, story SY-031).
//
// 1. Refuse if the server already holds data for the user (`hasData` from
//    enrol, or a cursor-"0" probe with the existing token): that user Joins.
// 2. In ONE local transaction (`prepareStart`):
//    - rewrite every public id that is not a canonical lowercase UUID
//      (`legacy:*` from 0013, the 32-hex ids of the 0013 triggers, anything
//      imported) to a fresh random UUID. Foreign keys are local integer ids
//      and account shortcuts store integer account ids, so nothing else
//      changes;
//    - normalise stored timestamps, dates and months to the contract formats
//      (SPEC.md 5.1), and make the delete fields consistent (5.5). These two
//      steps, and the check below, live in `normalise.ts`, shared with a
//      portable import while synced;
//    - mark every row of the ten tables dirty and unsealed, deleted rows too;
//    - check that every row now encodes to a valid envelope (the receiver's
//      check, 8.7), failing with a typed error naming the row otherwise;
//    - set the cursor to "0" (the "started" marker the engine checks) and
//      enable sync.
// 3. Run a sync cycle (`syncNow`, so the outcome is a status). An
//    interrupted upload is simply resumed by the next cycle: the rows are
//    still dirty and the cursor still "0".

import type { DatabaseCapability } from "@/platform/database";
import { PORTABLE_TABLES, type PortableTable } from "@/services/portable-data";
import type { SyncEngineDeps } from "@/services/sync/engine";
import {
  FormatTooNewError,
  SyncNotConfiguredError,
} from "@/services/sync/errors";
import {
  normaliseRowsForSync,
  validateRowsForSync,
} from "@/services/sync/normalise";
import { SYNC_FORMAT_VERSION, toTimestamp } from "@/services/sync/payload";
import { syncNow, type SyncStatus } from "@/services/sync/status";

/** The server already holds rows for this user: Join, do not Start. */
export class StartRefusedError extends Error {
  readonly code = "server_has_data";
  constructor() {
    super("The server already holds data for this user: Join instead of Start");
    this.name = "StartRefusedError";
  }
}

// ---------------------------------------------------------------------------
// The Start transaction
// ---------------------------------------------------------------------------

export type StartPreparation = {
  /** Public ids rewritten to fresh UUIDs, per table. */
  rewrittenIds: Record<PortableTable, number>;
  /** Rows whose timestamps, dates or delete fields were normalised. */
  normalisedRows: number;
  /** Rows marked dirty and unsealed (every row of the ten tables). */
  markedRows: number;
};

/**
 * Step 2 of Start, in one transaction (see the file comment). Throws
 * `InvalidOutgoingEnvelopeError` naming the first row that cannot be sent
 * even after normalisation; then nothing is changed.
 */
export const prepareStart = (
  database: DatabaseCapability,
  options: { now: () => number },
): Promise<StartPreparation> =>
  database.transaction(async (transaction) => {
    const nowTs = toTimestamp(options.now());
    const { rewrittenIds, normalisedRows } = await normaliseRowsForSync(
      transaction,
      { nowTs, scope: "all" },
    );
    let markedRows = 0;
    for (const table of PORTABLE_TABLES) {
      const [count] = await transaction.query<{ count: number }>({
        sql: `SELECT COUNT(*) AS count FROM ${table}`,
      });
      await transaction.execute({
        sql: `UPDATE ${table} SET sync_dirty = 1, sync_unsealed = 1, sync_rev = sync_rev + 1`,
      });
      markedRows += Number(count?.count ?? 0);
    }

    const stored = await transaction.query<{ count: number }>({
      sql: "SELECT COUNT(*) AS count FROM sync_tombstones",
    });
    await transaction.execute({
      sql: "UPDATE sync_tombstones SET dirty = 1, unsealed = 1",
    });
    markedRows += Number(stored[0]?.count ?? 0);

    await validateRowsForSync(transaction, "all");

    await transaction.execute({
      sql: "UPDATE sync_state SET cursor = '0', enabled = 1, last_error = NULL WHERE id = 1",
    });
    return { rewrittenIds, normalisedRows, markedRows };
  });

// ---------------------------------------------------------------------------
// Probe and Start
// ---------------------------------------------------------------------------

const readEnrolment = async (database: DatabaseCapability) => {
  const [row] = await database.query<{
    device_id: string | null;
    token: string | null;
    server_url: string | null;
  }>({ sql: "SELECT device_id, token, server_url FROM sync_state WHERE id = 1" });
  if (!row?.device_id) throw new SyncNotConfiguredError("device id");
  if (!row.token) throw new SyncNotConfiguredError("token");
  return { token: row.token, serverUrl: row.server_url };
};

/**
 * SPEC.md 11.1 step 1 with an existing token: a sync with cursor "0" and an
 * empty push. Any row (or `more`) means the server holds data for the user.
 * The server never returns the caller's own writes, so a device resuming its
 * own Start sees none.
 */
export const serverHasData = async (
  database: DatabaseCapability,
  deps: Pick<SyncEngineDeps, "transport" | "formatVersion">,
): Promise<boolean> => {
  const formatVersion = deps.formatVersion ?? SYNC_FORMAT_VERSION;
  const auth = await readEnrolment(database);
  const response = await deps.transport(
    { formatVersion, cursor: "0", push: [] },
    auth,
  );
  if (response.formatVersion > formatVersion) {
    throw new FormatTooNewError(response.formatVersion);
  }
  return response.pull.length > 0 || response.more;
};

export type StartOptions = {
  /**
   * `hasData` from the enrol response. Omit after a data reset (existing
   * token): the server is then probed.
   */
  hasData?: boolean;
};

export type StartResult = {
  prepared: StartPreparation;
  /** Status after the first cycle (`syncNow`). */
  status: SyncStatus;
};

/**
 * Start (SPEC.md 11.1). Requires enrolment (device id and token in
 * `sync_state`). Throws `StartRefusedError` when the server holds data, and
 * whatever the probe or the preparation throws (nothing is changed then).
 * Once the preparation has committed, the first cycle runs through `syncNow`:
 * a failure there is a status (offline, error...), and any later `syncNow`
 * resumes the upload.
 */
export const startSync = async (
  database: DatabaseCapability,
  deps: SyncEngineDeps,
  options: StartOptions = {},
): Promise<StartResult> => {
  await readEnrolment(database);
  const hasData = options.hasData ?? (await serverHasData(database, deps));
  if (hasData) throw new StartRefusedError();
  const prepared = await prepareStart(database, { now: deps.now });
  return { prepared, status: await syncNow(database, deps) };
};
