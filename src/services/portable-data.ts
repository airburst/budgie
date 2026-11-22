import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseTransaction,
} from "@/platform/database";
import {
  deleteTombstone,
  isNaturalKeyTable,
  NATURAL_KEYS,
  readTombstone,
  readTombstones,
  writeTombstone,
  type NaturalKeyTable,
  type TombstonePayload,
} from "@/services/tombstone-store";
import type { Preferences } from "@/types/electron";

export const PORTABLE_FORMAT_VERSION = 1;

type SyncFields = {
  publicId: string;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
};

export type PortableAccount = SyncFields & {
  name: string;
  number: string | null;
  type: string;
  balance: number;
  currency: string;
  notes: string | null;
  interestRate: number | null;
  creditLimit: number | null;
  deleted: boolean;
  pendingReconcileBalance: number | null;
  pendingReconcileDate: string | null;
};

export type PortableCategory = SyncFields & {
  parentPublicId: string | null;
  name: string;
  expenseType: string;
  deleted: boolean;
};

export type PortableTransaction = SyncFields & {
  accountPublicId: string;
  categoryPublicId: string | null;
  date: string;
  payee: string;
  amount: number;
  notes: string | null;
  cleared: boolean;
  reconciled: boolean;
  transferTransactionPublicId: string | null;
};

export type PortableAccountReconciliation = SyncFields & {
  accountPublicId: string;
  date: string;
  balance: number;
  notes: string | null;
};

export type PortableScheduledTransaction = SyncFields & {
  accountPublicId: string;
  categoryPublicId: string | null;
  payee: string;
  amount: number;
  rrule: string;
  nextDueDate: string | null;
  autoPost: boolean;
  daysInAdvance: number | null;
  notes: string | null;
  active: boolean;
  transferToAccountPublicId: string | null;
};

export type PortablePayee = SyncFields & {
  name: string;
  categoryPublicId: string | null;
  amount: number | null;
};

export type PortableEnvelope = SyncFields & {
  name: string;
  active: boolean;
  sortOrder: number;
};

export type PortableEnvelopeCategory = SyncFields & {
  envelopePublicId: string;
  categoryPublicId: string;
};

export type PortableBudgetAllocation = SyncFields & {
  envelopePublicId: string;
  month: string;
  assigned: number;
};

export type PortableBudgetTransfer = SyncFields & {
  fromEnvelopePublicId: string;
  toEnvelopePublicId: string;
  month: string;
  amount: number;
  notes: string | null;
};

export type PortableAccountShortcut = Omit<
  NonNullable<Preferences["accountShortcuts"]>[number],
  "accountId"
> & { accountPublicId: string };

export type PortablePreferences = Omit<Preferences, "accountShortcuts"> & {
  accountShortcuts?: PortableAccountShortcut[];
};

export type PortableData = {
  manifest: {
    formatVersion: typeof PORTABLE_FORMAT_VERSION;
    applicationVersion: string;
    exportedAt: string;
    minimumReaderVersion: string;
    checksum: string;
  };
  preferences: PortablePreferences;
  accounts: PortableAccount[];
  categories: PortableCategory[];
  transactions: PortableTransaction[];
  accountReconciliations: PortableAccountReconciliation[];
  scheduledTransactions: PortableScheduledTransaction[];
  payees: PortablePayee[];
  envelopes: PortableEnvelope[];
  envelopeCategories: PortableEnvelopeCategory[];
  budgetAllocations: PortableBudgetAllocation[];
  budgetTransfers: PortableBudgetTransfer[];
};

export type PortableExportOptions = {
  applicationVersion: string;
  minimumReaderVersion: string;
  exportedAt?: string;
};

type Row = DatabaseRow & {
  id: number;
  public_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type RowValue = DatabaseRow[string] | undefined;

const asString = (value: RowValue, field: string): string => {
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  return value;
};

const asNullableString = (value: RowValue): string | null =>
  typeof value === "string" ? value : null;

const asNumber = (value: RowValue, field: string): number => {
  if (typeof value !== "number") throw new Error(`Invalid ${field}`);
  return value;
};

const asNullableNumber = (value: RowValue): number | null =>
  typeof value === "number" ? value : null;

const asBoolean = (value: RowValue, field: string): boolean => {
  if (typeof value !== "number" && typeof value !== "boolean") {
    throw new Error(`Invalid ${field}`);
  }
  return Boolean(value);
};

const syncFields = (row: Row): SyncFields => ({
  publicId: asString(row.public_id, "public_id"),
  createdAt: asNullableString(row.created_at),
  updatedAt: asNullableString(row.updated_at),
  deletedAt: asNullableString(row.deleted_at),
});

const publicIds = (rows: Row[]) =>
  new Map(rows.map((row) => [row.id, asString(row.public_id, "public_id")]));

const reference = (ids: Map<number, string>, value: RowValue) =>
  value == null ? null : (ids.get(asNumber(value, "foreign key")) ?? null);

const requiredReference = (
  ids: Map<number, string>,
  value: RowValue,
  field: string,
) => {
  const result = reference(ids, value);
  if (result === null) throw new Error(`Missing ${field} reference`);
  return result;
};

const toPortablePreferences = (
  value: Preferences,
  accountIds: Map<number, string>,
): PortablePreferences => {
  const { accountShortcuts, ...portableValue } = value;
  return {
    ...portableValue,
    ...(accountShortcuts
      ? {
          accountShortcuts: accountShortcuts.map((shortcut) => ({
            key: shortcut.key,
            ...(shortcut.ctrl === undefined ? {} : { ctrl: shortcut.ctrl }),
            accountPublicId: requiredReference(
              accountIds,
              shortcut.accountId,
              "account shortcut",
            ),
          })),
        }
      : {}),
  };
};

const packageForChecksum = (data: PortableData) => ({
  ...data,
  manifest: { ...data.manifest, checksum: "" },
});

const checksum = async (data: PortableData) => {
  const bytes = new TextEncoder().encode(
    JSON.stringify(packageForChecksum(data)),
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const collections = [
  "accounts",
  "categories",
  "transactions",
  "accountReconciliations",
  "scheduledTransactions",
  "payees",
  "envelopes",
  "envelopeCategories",
  "budgetAllocations",
  "budgetTransfers",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateCollection = (data: PortableData, collection: string) => {
  const rows = data[collection as keyof PortableData];
  if (!Array.isArray(rows)) throw new Error(`Invalid ${collection} collection`);
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.publicId !== "string") {
      throw new Error(`Invalid ${collection} public ID`);
    }
    if (ids.has(row.publicId)) {
      throw new Error(`Duplicate ${collection} public ID: ${row.publicId}`);
    }
    ids.add(row.publicId);
  }
};

export const validatePortableData = (value: unknown): PortableData => {
  if (!isRecord(value) || !isRecord(value.manifest)) {
    throw new Error("Invalid portable data package");
  }
  const data = value as unknown as PortableData;
  if (data.manifest.formatVersion !== PORTABLE_FORMAT_VERSION) {
    throw new Error(
      `Unsupported portable data format: ${String(data.manifest.formatVersion)}`,
    );
  }
  if (typeof data.manifest.checksum !== "string") {
    throw new Error("Invalid portable data checksum");
  }
  if (!isRecord(data.preferences)) throw new Error("Invalid preferences");
  for (const collection of collections) validateCollection(data, collection);

  if (data.preferences.accountShortcuts !== undefined) {
    if (!Array.isArray(data.preferences.accountShortcuts)) {
      throw new Error("Invalid account shortcuts");
    }
    for (const shortcut of data.preferences.accountShortcuts) {
      if (
        !isRecord(shortcut) ||
        typeof shortcut.key !== "string" ||
        typeof shortcut.accountPublicId !== "string"
      ) {
        throw new Error("Invalid account shortcut");
      }
    }
  }

  const ids = Object.fromEntries(
    collections.map((collection) => [
      collection,
      new Set(
        (data[collection] as Array<{ publicId: string }>).map(
          (row) => row.publicId,
        ),
      ),
    ]),
  );
  const requireReference = (collection: keyof typeof ids, value: unknown) => {
    if (typeof value !== "string" || !ids[collection]?.has(value)) {
      throw new Error(`Invalid ${collection} relationship reference`);
    }
  };
  const optionalReference = (collection: keyof typeof ids, value: unknown) => {
    if (value !== null) requireReference(collection, value);
  };

  for (const row of data.categories)
    optionalReference("categories", row.parentPublicId);
  for (const row of data.transactions) {
    requireReference("accounts", row.accountPublicId);
    optionalReference("categories", row.categoryPublicId);
    optionalReference("transactions", row.transferTransactionPublicId);
  }
  for (const row of data.accountReconciliations) {
    requireReference("accounts", row.accountPublicId);
  }
  for (const row of data.scheduledTransactions) {
    requireReference("accounts", row.accountPublicId);
    optionalReference("categories", row.categoryPublicId);
    optionalReference("accounts", row.transferToAccountPublicId);
  }
  for (const row of data.payees)
    optionalReference("categories", row.categoryPublicId);
  for (const row of data.envelopeCategories) {
    requireReference("envelopes", row.envelopePublicId);
    requireReference("categories", row.categoryPublicId);
  }
  for (const row of data.budgetAllocations) {
    requireReference("envelopes", row.envelopePublicId);
  }
  for (const row of data.budgetTransfers) {
    requireReference("envelopes", row.fromEnvelopePublicId);
    requireReference("envelopes", row.toEnvelopePublicId);
  }
  for (const shortcut of data.preferences.accountShortcuts ?? []) {
    requireReference("accounts", shortcut.accountPublicId);
  }
  return data;
};

export const verifyPortableData = async (value: unknown) => {
  const data = validatePortableData(value);
  if ((await checksum(data)) !== data.manifest.checksum) {
    throw new Error("Portable data checksum mismatch");
  }
  return data;
};

/**
 * Returns `data` with its manifest checksum recomputed, for callers that build
 * or edit a package (for example a server snapshot) before importing it.
 */
export const sealPortableData = async (
  data: PortableData,
): Promise<PortableData> => ({
  ...data,
  manifest: { ...data.manifest, checksum: await checksum(data) },
});

export const serializePortableData = async (
  data: PortableData,
): Promise<string> => JSON.stringify(await verifyPortableData(data));

export const parsePortableData = async (
  document: string,
): Promise<PortableData> => {
  let value: unknown;
  try {
    value = JSON.parse(document);
  } catch {
    throw new Error("Invalid portable data JSON");
  }
  return verifyPortableData(value);
};

// ---------------------------------------------------------------------------
// Per-table row codec
//
// Export, import and sync all read and write rows through toPortableRow and
// applyPortableRow, driven by one description per table. Field order in each
// description is the order of the keys in the exported JSON (it feeds the
// package checksum), so do not reorder.
// ---------------------------------------------------------------------------

/** Table names in dependency (apply) order, as in the sync contract. */
export const PORTABLE_TABLES = [
  "accounts",
  "categories",
  "envelopes",
  "transactions",
  "account_reconciliations",
  "scheduled_transactions",
  "payees",
  "envelope_categories",
  "budget_allocations",
  "budget_transfers",
] as const;

export type PortableTable = (typeof PORTABLE_TABLES)[number];

export type PortableRowFor = {
  accounts: PortableAccount;
  categories: PortableCategory;
  envelopes: PortableEnvelope;
  transactions: PortableTransaction;
  account_reconciliations: PortableAccountReconciliation;
  scheduled_transactions: PortableScheduledTransaction;
  payees: PortablePayee;
  envelope_categories: PortableEnvelopeCategory;
  budget_allocations: PortableBudgetAllocation;
  budget_transfers: PortableBudgetTransfer;
};

/** The `PortableData` collection that holds each table's rows. */
export const PORTABLE_COLLECTIONS = {
  accounts: "accounts",
  categories: "categories",
  envelopes: "envelopes",
  transactions: "transactions",
  account_reconciliations: "accountReconciliations",
  scheduled_transactions: "scheduledTransactions",
  payees: "payees",
  envelope_categories: "envelopeCategories",
  budget_allocations: "budgetAllocations",
  budget_transfers: "budgetTransfers",
} as const satisfies Record<PortableTable, keyof PortableData>;

type ValueKind =
  "string" | "nullableString" | "number" | "nullableNumber" | "boolean";

type ValueSpec = {
  field: string;
  column: string;
  kind: ValueKind;
  label: string;
};

type ReferenceSpec = {
  field: string;
  column: string;
  target: PortableTable;
  required: boolean;
  label: string;
  /** Resolved in the second pass; written as NULL in the first. */
  secondPass?: boolean;
};

type FieldSpec = ValueSpec | ReferenceSpec;

type TableSpec = {
  fields: FieldSpec[];
  /** A second unique column that an incoming row may collide with. */
  alternateConflictColumn?: string;
};

const value = (
  field: string,
  column: string,
  kind: ValueKind,
  label: string,
): ValueSpec => ({ field, column, kind, label });

const ref = (
  field: string,
  column: string,
  target: PortableTable,
  required: boolean,
  label: string,
  secondPass = false,
): ReferenceSpec => ({
  field,
  column,
  target,
  required,
  label,
  ...(secondPass ? { secondPass } : {}),
});

const isReference = (spec: FieldSpec): spec is ReferenceSpec =>
  "target" in spec;

const tableSpecs: Record<PortableTable, TableSpec> = {
  accounts: {
    fields: [
      value("name", "name", "string", "account name"),
      value("number", "number", "nullableString", "account number"),
      value("type", "type", "string", "account type"),
      value("balance", "balance", "number", "account balance"),
      value("currency", "currency", "string", "account currency"),
      value("notes", "notes", "nullableString", "account notes"),
      value("interestRate", "interest_rate", "nullableNumber", "interest rate"),
      value("creditLimit", "credit_limit", "nullableNumber", "credit limit"),
      value("deleted", "deleted", "boolean", "account deleted"),
      value(
        "pendingReconcileBalance",
        "pending_reconcile_balance",
        "nullableNumber",
        "pending reconcile balance",
      ),
      value(
        "pendingReconcileDate",
        "pending_reconcile_date",
        "nullableString",
        "pending reconcile date",
      ),
    ],
  },
  categories: {
    fields: [
      ref("parentPublicId", "parent_id", "categories", false, "parent", true),
      value("name", "name", "string", "category name"),
      value("expenseType", "expense_type", "string", "category expense type"),
      value("deleted", "deleted", "boolean", "category deleted"),
    ],
  },
  envelopes: {
    fields: [
      value("name", "name", "string", "envelope name"),
      value("active", "active", "boolean", "envelope active"),
      value("sortOrder", "sort_order", "number", "envelope sort order"),
    ],
  },
  transactions: {
    fields: [
      ref("accountPublicId", "account_id", "accounts", true, "account"),
      ref("categoryPublicId", "category_id", "categories", false, "category"),
      value("date", "date", "string", "transaction date"),
      value("payee", "payee", "string", "transaction payee"),
      value("amount", "amount", "number", "transaction amount"),
      value("notes", "notes", "nullableString", "transaction notes"),
      value("cleared", "cleared", "boolean", "transaction cleared"),
      value("reconciled", "reconciled", "boolean", "transaction reconciled"),
      ref(
        "transferTransactionPublicId",
        "transfer_transaction_id",
        "transactions",
        false,
        "transfer",
        true,
      ),
    ],
  },
  account_reconciliations: {
    fields: [
      ref("accountPublicId", "account_id", "accounts", true, "account"),
      value("date", "date", "string", "reconciliation date"),
      value("balance", "balance", "number", "reconciliation balance"),
      value("notes", "notes", "nullableString", "reconciliation notes"),
    ],
  },
  scheduled_transactions: {
    fields: [
      ref("accountPublicId", "account_id", "accounts", true, "account"),
      ref("categoryPublicId", "category_id", "categories", false, "category"),
      value("payee", "payee", "string", "scheduled payee"),
      value("amount", "amount", "number", "scheduled amount"),
      value("rrule", "rrule", "string", "scheduled recurrence"),
      value("nextDueDate", "next_due_date", "nullableString", "next due date"),
      value("autoPost", "auto_post", "boolean", "scheduled auto-post"),
      value(
        "daysInAdvance",
        "days_in_advance",
        "nullableNumber",
        "days in advance",
      ),
      value("notes", "notes", "nullableString", "scheduled notes"),
      value("active", "active", "boolean", "scheduled active"),
      ref(
        "transferToAccountPublicId",
        "transfer_to_account_id",
        "accounts",
        false,
        "transfer account",
      ),
    ],
  },
  payees: {
    fields: [
      value("name", "name", "string", "payee name"),
      ref("categoryPublicId", "category_id", "categories", false, "category"),
      value("amount", "amount", "nullableNumber", "payee amount"),
    ],
  },
  envelope_categories: {
    fields: [
      ref("envelopePublicId", "envelope_id", "envelopes", true, "envelope"),
      ref("categoryPublicId", "category_id", "categories", true, "category"),
    ],
    alternateConflictColumn: "category_id",
  },
  budget_allocations: {
    fields: [
      ref("envelopePublicId", "envelope_id", "envelopes", true, "envelope"),
      value("month", "month", "string", "allocation month"),
      value("assigned", "assigned", "number", "allocation amount"),
    ],
  },
  budget_transfers: {
    fields: [
      ref(
        "fromEnvelopePublicId",
        "from_envelope_id",
        "envelopes",
        true,
        "source envelope",
      ),
      ref(
        "toEnvelopePublicId",
        "to_envelope_id",
        "envelopes",
        true,
        "target envelope",
      ),
      value("month", "month", "string", "transfer month"),
      value("amount", "amount", "number", "transfer amount"),
      value("notes", "notes", "nullableString", "transfer notes"),
    ],
  },
};

/** Maps a local row id in `table` to its public id, or null if unknown. */
export type PublicIdLookup = (
  table: PortableTable,
  id: number,
) => string | null;

const readValue = (spec: ValueSpec, raw: RowValue) => {
  switch (spec.kind) {
    case "string":
      return asString(raw, spec.label);
    case "nullableString":
      return asNullableString(raw);
    case "number":
      return asNumber(raw, spec.label);
    case "nullableNumber":
      return asNullableNumber(raw);
    case "boolean":
      return asBoolean(raw, spec.label);
  }
};

/**
 * Database row (as read with `SELECT *`) to portable row. Foreign keys become
 * public ids through `publicIdOf`; a required key that does not resolve throws.
 */
export const toPortableRow = <T extends PortableTable>(
  table: T,
  row: DatabaseRow,
  publicIdOf: PublicIdLookup,
): PortableRowFor[T] => {
  const source = row as Row;
  const result: Record<string, unknown> = { ...syncFields(source) };
  for (const spec of tableSpecs[table].fields) {
    const raw = source[spec.column];
    if (isReference(spec)) {
      const publicId =
        raw == null
          ? null
          : publicIdOf(spec.target, asNumber(raw, "foreign key"));
      if (publicId === null && spec.required) {
        throw new Error(`Missing ${spec.label} reference`);
      }
      result[spec.field] = publicId;
    } else {
      result[spec.field] = readValue(spec, raw);
    }
  }
  return result as PortableRowFor[T];
};

/**
 * Builds a lookup covering the foreign keys of `rows` by reading just the
 * referenced parents. For callers that encode a handful of rows (sync) rather
 * than a whole table.
 */
export const loadPublicIdLookup = async (
  transaction: DatabaseTransaction,
  table: PortableTable,
  rows: DatabaseRow[],
): Promise<PublicIdLookup> => {
  const wanted = new Map<PortableTable, Set<number>>();
  for (const spec of tableSpecs[table].fields) {
    if (!isReference(spec)) continue;
    for (const row of rows) {
      const id = row[spec.column];
      if (typeof id !== "number") continue;
      const ids = wanted.get(spec.target) ?? new Set<number>();
      ids.add(id);
      wanted.set(spec.target, ids);
    }
  }
  const known = new Map<string, string>();
  for (const [target, ids] of wanted) {
    const list = [...ids];
    for (let start = 0; start < list.length; start += 500) {
      const chunk = list.slice(start, start + 500);
      const found = await transaction.query<{ id: number; public_id: string }>({
        sql: `SELECT id, public_id FROM ${target} WHERE id IN (${chunk
          .map(() => "?")
          .join(", ")})`,
        params: chunk,
      });
      for (const item of found) {
        known.set(`${target}:${item.id}`, item.public_id);
      }
    }
  }
  return (target, id) => known.get(`${target}:${id}`) ?? null;
};

/** A referenced row is not in the local database (spec: `missing_reference`). */
export class MissingReferenceError extends Error {
  readonly code = "missing_reference";
  constructor(
    readonly table: PortableTable,
    readonly publicId: string,
    readonly field: string,
    readonly referencedTable: PortableTable,
    readonly referencedPublicId: string,
  ) {
    super(
      `missing_reference: ${table} ${publicId} field ${field} refers to missing ${referencedTable} ${referencedPublicId}`,
    );
    this.name = "MissingReferenceError";
  }
}

/** Resolves public ids to local row ids, caching hits for one transaction. */
export type ReferenceResolver = {
  resolve: (table: PortableTable, publicId: string) => Promise<number | null>;
  /** Loads a whole table's ids in one query (a speed-up for bulk apply). */
  preload: (table: PortableTable) => Promise<void>;
};

export const createReferenceResolver = (
  transaction: DatabaseTransaction,
): ReferenceResolver => {
  const cache = new Map<PortableTable, Map<string, number>>();
  const forTable = (table: PortableTable) => {
    const existing = cache.get(table);
    if (existing) return existing;
    const created = new Map<string, number>();
    cache.set(table, created);
    return created;
  };
  return {
    resolve: async (table, publicId) => {
      const known = forTable(table);
      const hit = known.get(publicId);
      if (hit !== undefined) return hit;
      const [found] = await transaction.query<{ id: number }>({
        sql: `SELECT id FROM ${table} WHERE public_id = ?`,
        params: [publicId],
      });
      if (!found) return null;
      known.set(publicId, found.id);
      return found.id;
    },
    preload: async (table) => {
      const known = forTable(table);
      const found = await transaction.query<{ id: number; public_id: string }>({
        sql: `SELECT id, public_id FROM ${table}`,
      });
      for (const item of found) known.set(item.public_id, item.id);
    },
  };
};

type SqlValue = string | number | boolean | null;

export type ApplyPortableRowOptions = {
  /**
   * Extra column values written in the same statement as the row (for example
   * sync state). Keys are column names; they are set on insert and on update.
   */
  extraColumns?: Record<string, SqlValue>;
  /**
   * Columns incremented (`column = column + 1`) when the row already exists,
   * in the same statement; left to their defaults on insert. The sync engine
   * passes `sync_rev`, its engine-write marker (migration 0014).
   */
  incrementColumns?: readonly string[];
  /**
   * Upsert on `public_id` only, never on the table's alternate unique
   * column: a different row holding that key makes the write fail instead
   * of being taken over (sync; natural keys are resolved by the engine).
   */
  publicIdConflictOnly?: boolean;
  /** Portable field names to leave out: not written, local value kept. */
  skipFields?: readonly string[];
  /**
   * Write the second-pass references (`categories.parentPublicId`,
   * `transactions.transferTransactionPublicId`) as NULL; resolve them later
   * with `resolveSecondPassReferences`.
   */
  deferSecondPass?: boolean;
  /** Share one resolver (and its cache) across many rows. */
  resolver?: ReferenceResolver;
};

const columnName = /^[a-z][a-z0-9_]*$/;

const toParam = (input: SqlValue) =>
  typeof input === "boolean" ? Number(input) : input;

const extraColumnEntries = (
  extraColumns: Record<string, SqlValue> | undefined,
) => {
  const entries = Object.entries(extraColumns ?? {});
  for (const [column] of entries) {
    if (!columnName.test(column)) throw new Error(`Invalid column: ${column}`);
  }
  return entries;
};

const incrementAssignments = (columns: readonly string[] | undefined) =>
  (columns ?? []).map((column) => {
    if (!columnName.test(column)) throw new Error(`Invalid column: ${column}`);
    return `${column} = ${column} + 1`;
  });

const plainValue = (label: string, raw: unknown): SqlValue => {
  if (raw === undefined || raw === null) return null;
  if (
    typeof raw === "string" ||
    typeof raw === "number" ||
    typeof raw === "boolean"
  ) {
    return raw;
  }
  throw new Error(`Invalid ${label}`);
};

const resolveReference = async (
  resolver: ReferenceResolver,
  table: PortableTable,
  publicId: string,
  spec: ReferenceSpec,
  raw: unknown,
): Promise<number | null> => {
  if (raw === undefined || raw === null) {
    if (spec.required) throw new Error(`Missing ${spec.label} reference`);
    return null;
  }
  if (typeof raw !== "string") throw new Error(`Invalid ${spec.field}`);
  const id = await resolver.resolve(spec.target, raw);
  if (id === null) {
    throw new MissingReferenceError(
      table,
      publicId,
      spec.field,
      spec.target,
      raw,
    );
  }
  return id;
};

/**
 * Upserts one portable row by `public_id`, resolving foreign keys from public
 * ids. Fields not described for the table (for example `bankText`) are ignored.
 * A non-null reference that does not resolve throws `MissingReferenceError`
 * before anything is written.
 */
export const applyPortableRow = async <T extends PortableTable>(
  transaction: DatabaseTransaction,
  table: T,
  row: PortableRowFor[T],
  options: ApplyPortableRowOptions = {},
): Promise<void> => {
  const source = row as unknown as Record<string, unknown>;
  const resolver = options.resolver ?? createReferenceResolver(transaction);
  const skipped = new Set(options.skipFields ?? []);
  const spec = tableSpecs[table];
  const publicId = source.publicId;
  if (typeof publicId !== "string") {
    throw new Error(`Invalid ${table} public ID`);
  }

  const columns = ["public_id", "created_at", "updated_at", "deleted_at"];
  const params: SqlValue[] = [
    publicId,
    plainValue("created at", source.createdAt),
    plainValue("updated at", source.updatedAt),
    plainValue("deleted at", source.deletedAt),
  ];
  for (const field of spec.fields) {
    if (skipped.has(field.field)) continue;
    columns.push(field.column);
    if (isReference(field)) {
      params.push(
        field.secondPass && options.deferSecondPass
          ? null
          : await resolveReference(
              resolver,
              table,
              publicId,
              field,
              source[field.field],
            ),
      );
    } else {
      params.push(plainValue(field.label, source[field.field]));
    }
  }
  for (const [column, extra] of extraColumnEntries(options.extraColumns)) {
    const existing = columns.indexOf(column);
    if (existing === -1) {
      columns.push(column);
      params.push(extra);
    } else {
      params[existing] = extra;
    }
  }

  const increments = incrementAssignments(options.incrementColumns);
  const assignments = (exclude: string) =>
    [
      ...columns
        .filter((column) => column !== exclude)
        .map((column) => `${column} = excluded.${column}`),
      ...increments,
    ].join(", ");
  const alternate = options.publicIdConflictOnly
    ? undefined
    : spec.alternateConflictColumn;
  await transaction.execute({
    sql: `INSERT INTO ${table} (${columns.join(", ")})
      VALUES (${columns.map(() => "?").join(", ")})
      ON CONFLICT(public_id) DO UPDATE SET ${assignments("public_id")}${
        alternate && columns.includes(alternate)
          ? `
      ON CONFLICT(${alternate}) DO UPDATE SET ${assignments(alternate)}`
          : ""
      }`,
    params: params.map(toParam),
  });
};

/** The second-pass reference of a table, if it has one. */
const secondPassSpec = (table: PortableTable) =>
  tableSpecs[table].fields.find(
    (field): field is ReferenceSpec => isReference(field) && !!field.secondPass,
  );

export type ResolveSecondPassOptions = {
  extraColumns?: Record<string, SqlValue>;
  /** As for `applyPortableRow`: `column = column + 1` in the same UPDATE. */
  incrementColumns?: readonly string[];
  resolver?: ReferenceResolver;
  skipFields?: readonly string[];
};

/**
 * Second pass: sets `categories.parent_id` / `transactions.transfer_transaction_id`
 * from the row's public id, once every row of the batch is written. Does
 * nothing for other tables. Throws `MissingReferenceError` if the target is
 * still absent, writing nothing for this row.
 */
export const resolveSecondPassReferences = async <T extends PortableTable>(
  transaction: DatabaseTransaction,
  table: T,
  row: PortableRowFor[T],
  options: ResolveSecondPassOptions = {},
): Promise<void> => {
  const spec = secondPassSpec(table);
  if (!spec || options.skipFields?.includes(spec.field)) return;
  const source = row as unknown as Record<string, unknown>;
  const publicId = source.publicId;
  if (typeof publicId !== "string") {
    throw new Error(`Invalid ${table} public ID`);
  }
  const resolver = options.resolver ?? createReferenceResolver(transaction);
  const id = await resolveReference(
    resolver,
    table,
    publicId,
    spec,
    source[spec.field],
  );
  const extra = extraColumnEntries(options.extraColumns);
  await transaction.execute({
    sql: `UPDATE ${table} SET ${[
      ...[spec.column, ...extra.map(([column]) => column)].map(
        (column) => `${column} = ?`,
      ),
      ...incrementAssignments(options.incrementColumns),
    ].join(", ")} WHERE public_id = ?`,
    params: [
      id,
      ...extra.map(([, extraValue]) => toParam(extraValue)),
      publicId,
    ],
  });
};

// ---------------------------------------------------------------------------
// Natural keys and the tombstone store (SPEC.md 8.10, migration 0015)
//
// A live row always lives in its table. A deleted row of a natural-key table
// lives in its table unless another row holds its key when it is written, or
// a live row needs the key later; it then moves to the tombstone store until
// it is live again. `placePortableRow` is the only writer that moves rows.
// ---------------------------------------------------------------------------

type TableRow = Row & {
  hlc: string | null;
  sync_dirty: number;
  sync_unsealed: number;
};

/** The row in payload shape, with exactly the table's fields in export order. */
const portablePayload = (
  table: PortableTable,
  source: Record<string, unknown>,
): TombstonePayload => {
  const payload: Record<string, unknown> = {
    publicId: source.publicId,
    createdAt: source.createdAt ?? null,
    updatedAt: source.updatedAt ?? null,
    deletedAt: source.deletedAt ?? null,
  };
  for (const field of tableSpecs[table].fields) {
    payload[field.field] = source[field.field] ?? null;
  }
  return payload as TombstonePayload;
};

/**
 * The row of `table` (deleted or not, other than `exceptPublicId`) that holds
 * the natural key of `row`, read with `SELECT *`; null if none, or if a key
 * reference does not resolve (then no row can hold it).
 */
export const findNaturalKeyHolder = async (
  transaction: DatabaseTransaction,
  table: NaturalKeyTable,
  row: Record<string, unknown>,
  resolver: ReferenceResolver,
  exceptPublicId: string | null = null,
): Promise<TableRow | null> => {
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  for (const name of NATURAL_KEYS[table].key) {
    const spec = tableSpecs[table].fields.find((field) => field.field === name);
    if (!spec) throw new Error(`Unknown natural key field ${table}.${name}`);
    const raw = row[name];
    if (isReference(spec)) {
      if (typeof raw !== "string") return null;
      const id = await resolver.resolve(spec.target, raw);
      if (id === null) return null;
      params.push(id);
    } else {
      params.push(plainValue(spec.label, raw));
    }
    conditions.push(`${spec.column} = ?`);
  }
  const [holder] = await transaction.query<TableRow>({
    sql: `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")} AND public_id IS NOT ?`,
    params: [...params.map(toParam), exceptPublicId],
  });
  return holder ?? null;
};

/** Copies a table row into the store with its sync state, then removes it from the table. */
const moveToStore = async (
  transaction: DatabaseTransaction,
  table: NaturalKeyTable,
  row: TableRow,
) => {
  const publicIdOf = await loadPublicIdLookup(transaction, table, [row]);
  const payload = portablePayload(
    table,
    toPortableRow(table, row, publicIdOf) as unknown as Record<string, unknown>,
  );
  await writeTombstone(transaction, {
    tbl: table,
    publicId: payload.publicId,
    hlc: row.hlc,
    dirty: row.sync_dirty === 1,
    unsealed: row.sync_unsealed === 1,
    payload,
  });
  await transaction.execute({
    sql: `DELETE FROM ${table} WHERE id = ?`,
    params: [row.id],
  });
};

/** Sync state of a row, as its table's columns or the store keep it. */
export type RowSyncState = {
  hlc: string | null;
  dirty: boolean;
  unsealed: boolean;
};

/** Two live rows of a natural-key table would hold one key. */
export class NaturalKeyConflictError extends Error {
  readonly code = "natural_key_conflict";
  constructor(
    readonly table: NaturalKeyTable,
    readonly publicId: string,
    readonly holderPublicId: string,
  ) {
    super(
      `${table} ${publicId} and ${holderPublicId} are both live with the same natural key`,
    );
    this.name = "NaturalKeyConflictError";
  }
}

export type PlacePortableRowOptions = {
  resolver?: ReferenceResolver;
  /**
   * An engine write: this sync state is written wherever the row lands (a
   * table write also bumps `sync_rev`). Without it the write is a user write
   * (portable import): table writes are left to the triggers, store writes
   * become dirty and unsealed, and a row's HLC is kept when it moves.
   */
  state?: RowSyncState;
  /**
   * Public ids whose own write is still to come in this batch. A live row in
   * this set that holds the key a live write needs is parked in the store
   * until its own write moves it back (a key swap). Any other live holder
   * throws `NaturalKeyConflictError`: collisions are resolved before writing.
   */
  pending?: ReadonlySet<string>;
};

/**
 * Upserts one portable row of a natural-key table by public id, in its table
 * or in the tombstone store (see above), and returns where it went. A live
 * row first moves a deleted row holding its key into the store. References
 * are checked like `applyPortableRow` (`MissingReferenceError`), also for a
 * row that goes to the store.
 */
export const placePortableRow = async <T extends NaturalKeyTable>(
  transaction: DatabaseTransaction,
  table: T,
  row: PortableRowFor[T],
  options: PlacePortableRowOptions = {},
): Promise<"table" | "store"> => {
  const source = row as unknown as Record<string, unknown>;
  const publicId = source.publicId;
  if (typeof publicId !== "string") {
    throw new Error(`Invalid ${table} public ID`);
  }
  const resolver = options.resolver ?? createReferenceResolver(transaction);
  for (const spec of tableSpecs[table].fields) {
    if (isReference(spec)) {
      await resolveReference(
        resolver,
        table,
        publicId,
        spec,
        source[spec.field],
      );
    }
  }
  const payload = portablePayload(table, source);
  const [current] = await transaction.query<TableRow>({
    sql: `SELECT * FROM ${table} WHERE public_id = ?`,
    params: [publicId],
  });
  const stored = current
    ? null
    : await readTombstone(transaction, table, publicId);
  const holder = await findNaturalKeyHolder(
    transaction,
    table,
    source,
    resolver,
    publicId,
  );

  if (payload.deletedAt !== null) {
    if (stored || holder) {
      await writeTombstone(transaction, {
        tbl: table,
        publicId,
        ...(options.state ?? {
          hlc: stored?.hlc ?? current?.hlc ?? null,
          dirty: true,
          unsealed: true,
        }),
        payload,
      });
      if (current) {
        await transaction.execute({
          sql: `DELETE FROM ${table} WHERE id = ?`,
          params: [current.id],
        });
      }
      return "store";
    }
  } else if (holder) {
    const holderId = holder.public_id ?? "";
    if (holder.deleted_at === null && !options.pending?.has(holderId)) {
      throw new NaturalKeyConflictError(table, publicId, holderId);
    }
    await moveToStore(transaction, table, holder);
  }

  if (stored) await deleteTombstone(transaction, table, publicId);
  const state =
    options.state ??
    (stored && stored.hlc !== null
      ? { hlc: stored.hlc, dirty: true, unsealed: true }
      : undefined);
  await applyPortableRow(transaction, table, row, {
    resolver,
    publicIdConflictOnly: true,
    ...(state
      ? {
          extraColumns: {
            hlc: state.hlc,
            sync_dirty: Number(state.dirty),
            sync_unsealed: Number(state.unsealed),
          },
          incrementColumns: ["sync_rev"],
        }
      : {}),
  });
  return "table";
};

// ---------------------------------------------------------------------------
// Portable import and export
// ---------------------------------------------------------------------------

const tombstone = async (transaction: DatabaseTransaction, table: string) => {
  await transaction.execute({
    sql: `UPDATE ${table} SET deleted_at = CURRENT_TIMESTAMP`,
  });
};

/**
 * Settings for an import. Non-empty package preferences replace the stored
 * ones, with shortcuts mapped from public ids (any that do not resolve are
 * dropped). Empty package preferences keep the stored settings; only their
 * shortcuts are re-checked against the imported accounts by public id.
 */
const importPreferences = async (
  transaction: DatabaseTransaction,
  preferences: PortablePreferences,
) => {
  const accounts = await transaction.query<{
    id: number;
    public_id: string;
    deleted_at: string | null;
  }>({ sql: "SELECT id, public_id, deleted_at FROM accounts" });

  if (Object.keys(preferences).length > 0) {
    const ids = new Map(accounts.map((row) => [row.public_id, row.id]));
    const { accountShortcuts, ...rest } = preferences;
    const local: Preferences = {
      ...rest,
      ...(accountShortcuts
        ? {
            accountShortcuts: accountShortcuts.flatMap((shortcut) => {
              const accountId = ids.get(shortcut.accountPublicId);
              return accountId === undefined
                ? []
                : [
                    {
                      key: shortcut.key,
                      ...(shortcut.ctrl === undefined
                        ? {}
                        : { ctrl: shortcut.ctrl }),
                      accountId,
                    },
                  ];
            }),
          }
        : {}),
    };
    await transaction.execute({
      sql: `INSERT INTO settings (id, preferences) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET preferences = excluded.preferences`,
      params: [JSON.stringify(local)],
    });
    return;
  }
  await remapAccountShortcuts(transaction);
};

/**
 * Keeps the stored settings, re-checking only their account shortcuts by
 * public id: a shortcut whose account is no longer live is dropped, the rest
 * point at the live row with that public id. Used by import with empty
 * preferences and by sync Join (SPEC.md 11.2).
 */
export const remapAccountShortcuts = async (
  transaction: DatabaseTransaction,
) => {
  const accounts = await transaction.query<{
    id: number;
    public_id: string;
    deleted_at: string | null;
  }>({ sql: "SELECT id, public_id, deleted_at FROM accounts" });
  const [stored] = await transaction.query<{ preferences: string }>({
    sql: "SELECT preferences FROM settings WHERE id = 1",
  });
  if (!stored) return;
  let current: Record<string, unknown>;
  try {
    current = JSON.parse(stored.preferences);
  } catch {
    return;
  }
  if (!Array.isArray(current.accountShortcuts)) return;

  const publicById = new Map(accounts.map((row) => [row.id, row.public_id]));
  const liveByPublicId = new Map(
    accounts
      .filter((row) => row.deleted_at === null)
      .map((row) => [row.public_id, row.id]),
  );
  const kept = (
    current.accountShortcuts as Array<{ accountId?: number }>
  ).flatMap((shortcut) => {
    const publicId = publicById.get(Number(shortcut.accountId));
    const accountId =
      publicId === undefined ? undefined : liveByPublicId.get(publicId);
    return accountId === undefined ? [] : [{ ...shortcut, accountId }];
  });
  if (JSON.stringify(kept) === JSON.stringify(current.accountShortcuts)) return;
  await transaction.execute({
    sql: "UPDATE settings SET preferences = ? WHERE id = 1",
    params: [JSON.stringify({ ...current, accountShortcuts: kept })],
  });
};

export const importPortableData = async (
  database: DatabaseCapability,
  value: unknown,
) => {
  const data = await verifyPortableData(value);

  await database.transaction(async (transaction) => {
    for (const table of PORTABLE_TABLES) await tombstone(transaction, table);
    await transaction.execute({
      sql: "UPDATE accounts SET deleted = 1",
    });
    await transaction.execute({
      sql: "UPDATE categories SET deleted = 1",
    });

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
        });
      }
      for (const row of rows) {
        await resolveSecondPassReferences(transaction, table, row as never, {
          resolver,
        });
      }
      await resolver.preload(table);
    }
    await importPreferences(transaction, data.preferences);
  });
};

export const createPortableData = async (
  database: DatabaseCapability,
  options: PortableExportOptions,
): Promise<PortableData> => {
  const data = await database.transaction(async (transaction) => {
    const read = async (table: string) =>
      transaction.query<Row>({ sql: `SELECT * FROM ${table} ORDER BY id ASC` });

    const [rowsByTable, settings] = await Promise.all([
      Promise.all(PORTABLE_TABLES.map((table) => read(table))),
      transaction.query<{ preferences: string }>({
        sql: "SELECT preferences FROM settings WHERE id = 1",
      }),
    ]);
    const rows = Object.fromEntries(
      PORTABLE_TABLES.map((table, index) => [table, rowsByTable[index] ?? []]),
    ) as Record<PortableTable, Row[]>;

    const ids = Object.fromEntries(
      PORTABLE_TABLES.map((table) => [table, publicIds(rows[table])]),
    ) as Record<PortableTable, Map<number, string>>;
    const publicIdOf: PublicIdLookup = (table, id) =>
      ids[table].get(id) ?? null;
    // Stored tombstones follow their table's rows (none: output unchanged).
    const stored = Object.fromEntries(
      await Promise.all(
        PORTABLE_TABLES.map(async (table) => [
          table,
          (await readTombstones(transaction, table)).map((tombstone) =>
            portablePayload(table, tombstone.payload),
          ),
        ]),
      ),
    ) as Record<PortableTable, TombstonePayload[]>;
    const encode = <T extends PortableTable>(table: T) => [
      ...rows[table].map((row) => toPortableRow(table, row, publicIdOf)),
      ...(stored[table] as unknown as PortableRowFor[T][]),
    ];

    const result: PortableData = {
      manifest: {
        formatVersion: PORTABLE_FORMAT_VERSION,
        applicationVersion: options.applicationVersion,
        exportedAt: options.exportedAt ?? new Date().toISOString(),
        minimumReaderVersion: options.minimumReaderVersion,
        checksum: "",
      },
      preferences: toPortablePreferences(
        settings[0]?.preferences ? JSON.parse(settings[0].preferences) : {},
        ids.accounts,
      ),
      accounts: encode("accounts"),
      categories: encode("categories"),
      transactions: encode("transactions"),
      accountReconciliations: encode("account_reconciliations"),
      scheduledTransactions: encode("scheduled_transactions"),
      payees: encode("payees"),
      envelopes: encode("envelopes"),
      envelopeCategories: encode("envelope_categories"),
      budgetAllocations: encode("budget_allocations"),
      budgetTransfers: encode("budget_transfers"),
    };

    return result;
  });

  data.manifest.checksum = await checksum(data);
  return data;
};
