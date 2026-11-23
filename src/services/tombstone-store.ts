// The tombstone store (migration 0015, SPEC.md 8.10): deleted rows of the
// three natural-key tables that had to leave their table so a live row could
// take their key. A stored row is still a row of its table for every sync and
// export purpose; this module only reads and writes the store itself. Where a
// row lives is decided by `placePortableRow` in ./portable-data.ts (see the
// header of 0015_sync_tombstones.sql for the rule).

import type { DatabaseTransaction } from "@/platform/database";
import type { PortableTable } from "@/services/portable-data";

export const NATURAL_KEY_TABLES = [
  "payees",
  "envelope_categories",
  "budget_allocations",
] as const;

export type NaturalKeyTable = (typeof NATURAL_KEY_TABLES)[number];

export const isNaturalKeyTable = (table: string): table is NaturalKeyTable =>
  (NATURAL_KEY_TABLES as readonly string[]).includes(table);

/**
 * Natural key and content fields of each table, as payload field names
 * (SPEC.md 8.10, `naturalKeys` in tables.json).
 */
export const NATURAL_KEYS: Record<
  NaturalKeyTable,
  { key: readonly string[]; content: readonly string[] }
> = {
  payees: { key: ["name"], content: ["categoryPublicId", "amount"] },
  envelope_categories: {
    key: ["categoryPublicId"],
    content: ["envelopePublicId"],
  },
  budget_allocations: {
    key: ["envelopePublicId", "month"],
    content: ["assigned"],
  },
};

export type TombstonePayload = Record<string, unknown> & { publicId: string };

/** One stored row: its payload plus the same sync state its table keeps. */
export type StoredTombstone = {
  tbl: NaturalKeyTable;
  publicId: string;
  hlc: string | null;
  dirty: boolean;
  unsealed: boolean;
  payload: TombstonePayload;
};

type StoreRow = {
  tbl: string;
  public_id: string;
  hlc: string | null;
  dirty: number;
  unsealed: number;
  payload: string;
};

const fromRow = (row: StoreRow): StoredTombstone => ({
  tbl: row.tbl as NaturalKeyTable,
  publicId: row.public_id,
  hlc: row.hlc,
  dirty: row.dirty === 1,
  unsealed: row.unsealed === 1,
  payload: JSON.parse(row.payload) as TombstonePayload,
});

export const readTombstone = async (
  transaction: DatabaseTransaction,
  table: PortableTable,
  publicId: string,
): Promise<StoredTombstone | null> => {
  if (!isNaturalKeyTable(table)) return null;
  const [row] = await transaction.query<StoreRow>({
    sql: "SELECT * FROM sync_tombstones WHERE tbl = ? AND public_id = ?",
    params: [table, publicId],
  });
  return row ? fromRow(row) : null;
};

/** Stored rows of one table, ordered by public id; optionally only dirty or unsealed ones. */
export const readTombstones = async (
  transaction: Pick<DatabaseTransaction, "query">,
  table: PortableTable,
  filter: { dirty?: boolean; unsealed?: boolean } = {},
): Promise<StoredTombstone[]> => {
  if (!isNaturalKeyTable(table)) return [];
  const conditions = ["tbl = ?"];
  if (filter.dirty !== undefined) conditions.push(`dirty = ${Number(filter.dirty)}`);
  if (filter.unsealed !== undefined) {
    conditions.push(`unsealed = ${Number(filter.unsealed)}`);
  }
  const rows = await transaction.query<StoreRow>({
    sql: `SELECT * FROM sync_tombstones WHERE ${conditions.join(" AND ")} ORDER BY public_id`,
    params: [table],
  });
  return rows.map(fromRow);
};

/** Inserts or replaces a stored row. */
export const writeTombstone = async (
  transaction: DatabaseTransaction,
  tombstone: StoredTombstone,
): Promise<void> => {
  await transaction.execute({
    sql: `INSERT INTO sync_tombstones (tbl, public_id, hlc, dirty, unsealed, payload)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(tbl, public_id) DO UPDATE SET hlc = excluded.hlc,
        dirty = excluded.dirty, unsealed = excluded.unsealed,
        payload = excluded.payload`,
    params: [
      tombstone.tbl,
      tombstone.publicId,
      tombstone.hlc,
      Number(tombstone.dirty),
      Number(tombstone.unsealed),
      JSON.stringify(tombstone.payload),
    ],
  });
};

export const deleteTombstone = async (
  transaction: DatabaseTransaction,
  table: NaturalKeyTable,
  publicId: string,
): Promise<void> => {
  await transaction.execute({
    sql: "DELETE FROM sync_tombstones WHERE tbl = ? AND public_id = ?",
    params: [table, publicId],
  });
};

/** Reference fields of stored payloads, by the table they point to. */
const STORED_REFERENCES: Record<
  NaturalKeyTable,
  ReadonlyArray<{ field: string; target: PortableTable }>
> = {
  payees: [{ field: "categoryPublicId", target: "categories" }],
  envelope_categories: [
    { field: "envelopePublicId", target: "envelopes" },
    { field: "categoryPublicId", target: "categories" },
  ],
  budget_allocations: [{ field: "envelopePublicId", target: "envelopes" }],
};

/**
 * For Start (SPEC.md 11.1), which rewrites non-canonical public ids: applies
 * `mapping` (old public id to new) of rows of `table` to stored rows, both
 * their own public ids and the references in their payloads. Call once per
 * rewritten table, in the same transaction as the table rewrite.
 */
export const rewriteTombstonePublicIds = async (
  transaction: DatabaseTransaction,
  table: PortableTable,
  mapping: ReadonlyMap<string, string>,
): Promise<void> => {
  if (mapping.size === 0) return;
  for (const tbl of NATURAL_KEY_TABLES) {
    const references = STORED_REFERENCES[tbl].filter(
      (reference) => reference.target === table,
    );
    if (tbl !== table && references.length === 0) continue;
    for (const stored of await readTombstones(transaction, tbl)) {
      const payload: TombstonePayload = { ...stored.payload };
      for (const { field } of references) {
        const value = payload[field];
        if (typeof value === "string" && mapping.has(value)) {
          payload[field] = mapping.get(value);
        }
      }
      const publicId =
        tbl === table
          ? (mapping.get(stored.publicId) ?? stored.publicId)
          : stored.publicId;
      payload.publicId = publicId;
      if (publicId !== stored.publicId) {
        await deleteTombstone(transaction, tbl, stored.publicId);
      }
      await writeTombstone(transaction, { ...stored, publicId, payload });
    }
  }
};
