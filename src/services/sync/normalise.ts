// Bringing local rows to the wire contract before they are sent: canonical
// UUID public ids (SPEC.md 3.1), contract formats for timestamps, dates and
// months (5.1), consistent delete fields (5.5), and a check that every row
// encodes to an envelope a receiver accepts (8.7). Shared by Start (SPEC.md
// 11.1, every row) and by a portable import while synced (story SY-034,
// every dirty row).

import type {
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
import { InvalidOutgoingEnvelopeError } from "@/services/sync/errors";
import {
  toOutgoingEnvelope,
  toTimestamp,
  UUID_PATTERN,
  type SyncPayload,
} from "@/services/sync/payload";
import {
  isNaturalKeyTable,
  readTombstones,
  rewriteTombstonePublicIds,
  writeTombstone,
} from "@/services/tombstone-store";

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

  if (row.created_at != null)
    set("created_at", normaliseTimestamp(row.created_at));
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
      kind === "date"
        ? normaliseDate(row[column])
        : normaliseMonth(row[column]);
    if (value !== null) set(column, value);
  }
  return changes;
};

// ---------------------------------------------------------------------------
// Normalising and checking rows in a transaction
// ---------------------------------------------------------------------------

/**
 * Which rows to bring to the contract: every row (Start, which then marks
 * them all dirty) or only the dirty ones, the rows that will be pushed
 * (import while synced; clean rows, such as the old rows Join left behind,
 * are never sent and stay as they are).
 */
export type NormaliseScope = "all" | "dirty";

const rowFilter = (scope: NormaliseScope) =>
  scope === "dirty" ? " WHERE sync_dirty = 1" : "";

const storeFilter = (scope: NormaliseScope) =>
  scope === "dirty" ? { dirty: true } : {};

export type NormaliseResult = {
  /** Public ids rewritten to fresh UUIDs, per table. */
  rewrittenIds: Record<PortableTable, number>;
  /** Rows (store rows included) whose timestamps, dates or delete fields changed. */
  normalisedRows: number;
};

/** Payload fields of a stored row, by the column `normaliseRow` reads. */
const STORED_COLUMNS = {
  created_at: "createdAt",
  updated_at: "updatedAt",
  deleted_at: "deletedAt",
  month: "month",
} as const;

/** `normaliseRow` for a row in the tombstone store, on its payload; null if unchanged. */
const normaliseStoredPayload = (
  table: PortableTable,
  payload: Record<string, unknown>,
  nowTs: string,
): Record<string, unknown> | null => {
  const row: DatabaseRow = {};
  for (const [column, field] of Object.entries(STORED_COLUMNS)) {
    const value = payload[field];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      value === null
    ) {
      row[column] = value;
    }
  }
  const changes = Object.entries(normaliseRow(table, row, nowTs));
  if (changes.length === 0) return null;
  const next = { ...payload };
  for (const [column, value] of changes) {
    next[STORED_COLUMNS[column as keyof typeof STORED_COLUMNS]] = value;
  }
  return next;
};

/**
 * Rewrites every public id in scope that is not a canonical lowercase UUID
 * (`legacy:*` from 0013, the 32-hex ids of the 0013 triggers, anything
 * imported) to a fresh random UUID, then normalises the rows in scope
 * (`normaliseRow`), tombstone store included. Foreign keys are local integer
 * ids and account shortcuts store integer account ids, so nothing else
 * changes. Every statement is an engine write (`sync_rev` bump): the triggers
 * must not bump `updated_at`, which is the edit time the seal uses, nor
 * change any row's dirty state.
 */
export const normaliseRowsForSync = async (
  transaction: DatabaseTransaction,
  options: { nowTs: string; scope: NormaliseScope },
): Promise<NormaliseResult> => {
  const { nowTs, scope } = options;
  const rewrittenIds = Object.fromEntries(
    PORTABLE_TABLES.map((table) => [table, 0]),
  ) as Record<PortableTable, number>;
  let normalisedRows = 0;

  for (const table of PORTABLE_TABLES) {
    const ids = await transaction.query<{
      id: number;
      public_id: string | null;
    }>({ sql: `SELECT id, public_id FROM ${table}${rowFilter(scope)}` });
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
      for (const stored of await readTombstones(
        transaction,
        table,
        storeFilter(scope),
      )) {
        if (UUID_PATTERN.test(stored.publicId)) continue;
        mapping.set(stored.publicId, crypto.randomUUID());
        rewrittenIds[table]++;
      }
    }
    await rewriteTombstonePublicIds(transaction, table, mapping);

    const rows = await transaction.query({
      sql: `SELECT * FROM ${table}${rowFilter(scope)}`,
    });
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
    if (isNaturalKeyTable(table)) {
      for (const stored of await readTombstones(
        transaction,
        table,
        storeFilter(scope),
      )) {
        const payload = normaliseStoredPayload(table, stored.payload, nowTs);
        if (!payload) continue;
        await writeTombstone(transaction, {
          ...stored,
          payload: { ...payload, publicId: stored.publicId },
        });
        normalisedRows++;
      }
    }
  }
  return { rewrittenIds, normalisedRows };
};

/** HLC for validating payloads before they are sealed. */
const PLACEHOLDER_HLC =
  "000000000000000:00000:00000000-0000-0000-0000-000000000000";

/**
 * Every row in scope, tombstone store included, must encode to an envelope a
 * receiver accepts (SPEC.md 8.7). Throws `InvalidOutgoingEnvelopeError`
 * naming the first row that does not.
 */
export const validateRowsForSync = async (
  transaction: DatabaseTransaction,
  scope: NormaliseScope,
): Promise<void> => {
  for (const table of PORTABLE_TABLES) {
    const rows = await transaction.query({
      sql: `SELECT * FROM ${table}${rowFilter(scope)}`,
    });
    if (rows.length > 0) {
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
    }
    for (const stored of await readTombstones(
      transaction,
      table,
      storeFilter(scope),
    )) {
      toOutgoingEnvelope(table, PLACEHOLDER_HLC, stored.payload as SyncPayload);
    }
  }
};
