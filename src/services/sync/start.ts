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
//      (SPEC.md 5.1), and make the delete fields consistent (5.5);
//    - mark every row of the ten tables dirty and unsealed, deleted rows too;
//    - check that every row now encodes to a valid envelope (the receiver's
//      check, 8.7), failing with a typed error naming the row otherwise;
//    - set the cursor to "0" (the "started" marker the engine checks) and
//      enable sync.
// 3. Run a sync cycle (`syncNow`, so the outcome is a status). An
//    interrupted upload is simply resumed by the next cycle: the rows are
//    still dirty and the cursor still "0".

import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseTransaction,
  DatabaseValue,
} from "@/platform/database";
import {
  loadPublicIdLookup,
  PORTABLE_TABLES,
  type PortableTable,
} from "@/services/portable-data";
import { encodeSyncRow } from "@/services/sync/codec";
import {
  isNaturalKeyTable,
  readTombstones,
  rewriteTombstonePublicIds,
} from "@/services/tombstone-store";
import type { SyncEngineDeps } from "@/services/sync/engine";
import {
  FormatTooNewError,
  InvalidOutgoingEnvelopeError,
  SyncNotConfiguredError,
} from "@/services/sync/errors";
import {
  SYNC_FORMAT_VERSION,
  toOutgoingEnvelope,
  toTimestamp,
  UUID_PATTERN,
  type SyncPayload,
} from "@/services/sync/payload";
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
// Format normalisation (pure). Each returns the contract form, or null when
// the value cannot be read.
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

const isCalendarDate = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
};

/** Unix seconds (below 1e11) or milliseconds, to milliseconds. */
const epochMs = (value: number): number | null => {
  if (!Number.isFinite(value) || value < 0) return null;
  const ms = value < 1e11 ? value * 1000 : value;
  return ms <= 253402300799000 ? Math.trunc(ms) : null; // up to 9999-12-31
};

const DATE_TIME =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[Tt ](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?)?\s*(Z|z|UTC|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * Any timestamp Budgie or an import may have stored (`CURRENT_TIMESTAMP`
 * form, ISO 8601 with `T`, fraction or zone, a bare date, Unix seconds or
 * milliseconds) as `YYYY-MM-DD HH:MM:SS` UTC. No zone means UTC, as SQLite's
 * `CURRENT_TIMESTAMP`.
 */
export const normaliseTimestamp = (
  value: DatabaseValue | undefined,
): string | null => {
  if (typeof value === "number") {
    const ms = epochMs(value);
    return ms === null ? null : toTimestamp(ms);
  }
  if (typeof value !== "string") return null;
  const match = DATE_TIME.exec(value.trim());
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match
    .slice(1, 7)
    .map((part) => Number(part ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (!isCalendarDate(y, mo, d) || h > 23 || mi > 59 || s > 59) return null;
  let ms = Date.UTC(y, mo - 1, d, h, mi, s);
  const zone = match[7];
  if (zone && /^[+-]/.test(zone)) {
    const digits = zone.replace(":", "");
    const minutes =
      Number(digits.slice(1, 3)) * 60 + Number(digits.slice(3, 5) || 0);
    ms -= (zone.startsWith("-") ? -1 : 1) * minutes * 60_000;
  }
  return epochMs(ms) === null ? null : toTimestamp(ms);
};

const DATE_PREFIX = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:$|[Tt ])/;

/**
 * A calendar date as `YYYY-MM-DD`: the date part as written (a time or zone
 * after it is dropped, never converted, so the day the user saw is kept), or
 * the UTC date of Unix seconds or milliseconds.
 */
export const normaliseDate = (
  value: DatabaseValue | undefined,
): string | null => {
  if (typeof value === "number") {
    const ms = epochMs(value);
    return ms === null ? null : toTimestamp(ms).slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const match = DATE_PREFIX.exec(value.trim());
  if (!match) return null;
  const [y, m, d] = match.slice(1, 4).map(Number) as [number, number, number];
  return isCalendarDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
};

const MONTH_PREFIX = /^(\d{4})[-/](\d{1,2})(?:$|[-/Tt ])/;

/** A calendar month as `YYYY-MM` (a day or time after it is dropped). */
export const normaliseMonth = (
  value: DatabaseValue | undefined,
): string | null => {
  if (typeof value !== "string") return null;
  const match = MONTH_PREFIX.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  return m >= 1 && m <= 12 ? `${y}-${pad(m)}` : null;
};

/** Sent columns holding a `date` or `month` (SPEC.md 5.3). */
const CALENDAR_COLUMNS: Partial<
  Record<PortableTable, Array<{ column: string; kind: "date" | "month" }>>
> = {
  transactions: [{ column: "date", kind: "date" }],
  account_reconciliations: [{ column: "date", kind: "date" }],
  scheduled_transactions: [{ column: "next_due_date", kind: "date" }],
  budget_allocations: [{ column: "month", kind: "month" }],
  budget_transfers: [{ column: "month", kind: "month" }],
};

const LEGACY_DELETED_FLAG: ReadonlySet<PortableTable> = new Set([
  "accounts",
  "categories",
]);

/**
 * Column changes that bring one row to the contract formats, or an empty
 * object. A value that cannot be read is left alone when the column is
 * required (the validation step then names the row) and cleared when it is a
 * nullable timestamp. `updated_at` in the future is clamped to `nowTs`, or its
 * HLC would be drift-rejected until that time.
 */
export const normaliseRow = (
  table: PortableTable,
  row: DatabaseRow,
  nowTs: string,
): Record<string, DatabaseValue> => {
  const changes: Record<string, DatabaseValue> = {};
  const set = (column: string, value: DatabaseValue) => {
    if (row[column] !== value) changes[column] = value;
  };

  if (row.created_at != null) set("created_at", normaliseTimestamp(row.created_at));
  let updatedAt =
    row.updated_at == null ? null : normaliseTimestamp(row.updated_at);
  if (updatedAt !== null && updatedAt > nowTs) updatedAt = nowTs;
  if (row.updated_at != null) set("updated_at", updatedAt);

  const flagged = LEGACY_DELETED_FLAG.has(table) && Boolean(row.deleted);
  const deleted = row.deleted_at != null || flagged;
  if (deleted) {
    set(
      "deleted_at",
      normaliseTimestamp(row.deleted_at ?? null) ?? updatedAt ?? nowTs,
    );
    if (LEGACY_DELETED_FLAG.has(table) && !flagged) set("deleted", 1);
  }

  for (const { column, kind } of CALENDAR_COLUMNS[table] ?? []) {
    if (row[column] == null) continue;
    const value =
      kind === "date" ? normaliseDate(row[column]) : normaliseMonth(row[column]);
    if (value !== null) set(column, value);
  }
  return changes;
};

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

/** HLC for validating payloads before they are sealed. */
const PLACEHOLDER_HLC =
  "000000000000000:00000:00000000-0000-0000-0000-000000000000";

/** Every row must encode to an envelope a receiver accepts (SPEC.md 8.7). */
const validateTable = async (
  transaction: DatabaseTransaction,
  table: PortableTable,
) => {
  const rows = await transaction.query({ sql: `SELECT * FROM ${table}` });
  if (rows.length === 0) return;
  const publicIdOf = await loadPublicIdLookup(transaction, table, rows);
  for (const row of rows) {
    let payload: SyncPayload;
    try {
      payload = encodeSyncRow(table, row, publicIdOf) as SyncPayload;
    } catch (error) {
      throw new InvalidOutgoingEnvelopeError(
        table,
        typeof row.public_id === "string" ? row.public_id : null,
        error instanceof Error ? error.message : String(error),
      );
    }
    toOutgoingEnvelope(table, PLACEHOLDER_HLC, payload);
  }
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
    const rewrittenIds = Object.fromEntries(
      PORTABLE_TABLES.map((table) => [table, 0]),
    ) as Record<PortableTable, number>;
    let normalisedRows = 0;
    let markedRows = 0;

    for (const table of PORTABLE_TABLES) {
      // Every statement is an engine write (sync_rev bump): the triggers must
      // not bump updated_at, which is the edit time the seal uses.
      const ids = await transaction.query<{
        id: number;
        public_id: string | null;
      }>({ sql: `SELECT id, public_id FROM ${table}` });
      const mapping = new Map<string, string>();
      for (const row of ids) {
        if (row.public_id !== null && UUID_PATTERN.test(row.public_id)) continue;
        const publicId = crypto.randomUUID();
        await transaction.execute({
          sql: `UPDATE ${table} SET public_id = ?, sync_rev = sync_rev + 1 WHERE id = ?`,
          params: [publicId, row.id],
        });
        if (row.public_id !== null) mapping.set(row.public_id, publicId);
        rewrittenIds[table]++;
      }
      // Rows held in the tombstone store (SY-029) are sent too: give them
      // canonical ids and follow the rewritten ids they refer to.
      if (isNaturalKeyTable(table)) {
        for (const stored of await readTombstones(transaction, table)) {
          if (UUID_PATTERN.test(stored.publicId)) continue;
          mapping.set(stored.publicId, crypto.randomUUID());
          rewrittenIds[table]++;
        }
      }
      await rewriteTombstonePublicIds(transaction, table, mapping);

      const rows = await transaction.query({ sql: `SELECT * FROM ${table}` });
      for (const row of rows) {
        const changes = Object.entries(normaliseRow(table, row, nowTs));
        if (changes.length === 0) continue;
        await transaction.execute({
          sql: `UPDATE ${table} SET ${changes
            .map(([column]) => `${column} = ?`)
            .join(", ")}, sync_rev = sync_rev + 1 WHERE id = ?`,
          params: [...changes.map(([, value]) => value), row.id as number],
        });
        normalisedRows++;
      }

      await transaction.execute({
        sql: `UPDATE ${table} SET sync_dirty = 1, sync_unsealed = 1, sync_rev = sync_rev + 1`,
      });
      markedRows += rows.length;
    }

    const stored = await transaction.query<{ count: number }>({
      sql: "SELECT COUNT(*) AS count FROM sync_tombstones",
    });
    await transaction.execute({
      sql: "UPDATE sync_tombstones SET dirty = 1, unsealed = 1",
    });
    markedRows += Number(stored[0]?.count ?? 0);

    for (const table of PORTABLE_TABLES) await validateTable(transaction, table);

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
