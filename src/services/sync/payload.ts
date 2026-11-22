// Wire shapes and payload rules of the sync contract (SPEC.md sections 5, 6
// and 9.3) that need the envelope, not just the row: field validation of a
// pulled payload (section 8.7) and the delete normalisation (section 5.5).
// Row <-> payload conversion itself lives in ./codec.ts.

import type { PortableTable } from "@/services/portable-data";
import { InvalidOutgoingEnvelopeError } from "@/services/sync/errors";
import { HLC_PATTERN, parseHlc } from "@/services/sync/hlc";

/** The sync format version this engine speaks (SPEC.md section 4). */
export const SYNC_FORMAT_VERSION = 1;

export type SyncPayload = Record<string, unknown> & { publicId: string };

/** One synced row version (SPEC.md section 6). */
export type SyncEnvelope = {
  tbl: PortableTable;
  publicId: string;
  hlc: string;
  deleted: boolean;
  payload: SyncPayload;
};

export type SyncRejection = {
  tbl: PortableTable;
  publicId: string;
  reason: "stale" | "drift";
};

/** Body of `POST /v1/sync` (SPEC.md section 9.3). */
export type SyncRequest = {
  formatVersion: number;
  cursor: string;
  push: SyncEnvelope[];
};

/** A `200` response of `POST /v1/sync`. */
export type SyncResponse = {
  formatVersion: number;
  cursor: string;
  more: boolean;
  pull: SyncEnvelope[];
  rejected: SyncRejection[];
};

type FieldType =
  | "uuid"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "timestamp"
  | "date"
  | "month";

export type SyncFieldSpec = {
  name: string;
  type: FieldType;
  nullable: boolean;
  enum?: readonly string[];
};

const f = (
  name: string,
  type: FieldType,
  nullable = false,
  values?: readonly string[],
): SyncFieldSpec => ({ name, type, nullable, ...(values ? { enum: values } : {}) });

const common = [
  f("publicId", "uuid"),
  f("createdAt", "timestamp", true),
  f("updatedAt", "timestamp", true),
  f("deletedAt", "timestamp", true),
];

/**
 * The sent fields of every table, as in `sync-server/contract/tables.json`
 * (normative; `sync-engine-payload.unit.test.ts` fails if they drift).
 */
export const SYNC_PAYLOAD_FIELDS: Record<PortableTable, SyncFieldSpec[]> = {
  accounts: [
    ...common,
    f("name", "string"),
    f("number", "string", true),
    f("type", "string", false, [
      "bank",
      "credit_card",
      "loan",
      "investment",
      "cash",
    ]),
    f("balance", "number"),
    f("currency", "string"),
    f("notes", "string", true),
    f("interestRate", "number", true),
    f("creditLimit", "number", true),
    f("deleted", "boolean"),
  ],
  categories: [
    ...common,
    f("parentPublicId", "uuid", true),
    f("name", "string"),
    f("expenseType", "string", false, ["expense", "income", "transfer"]),
    f("deleted", "boolean"),
  ],
  envelopes: [
    ...common,
    f("name", "string"),
    f("active", "boolean"),
    f("sortOrder", "integer"),
  ],
  transactions: [
    ...common,
    f("accountPublicId", "uuid"),
    f("categoryPublicId", "uuid", true),
    f("date", "date"),
    f("payee", "string"),
    f("amount", "number"),
    f("notes", "string", true),
    f("cleared", "boolean"),
    f("reconciled", "boolean"),
    f("transferTransactionPublicId", "uuid", true),
  ],
  account_reconciliations: [
    ...common,
    f("accountPublicId", "uuid"),
    f("date", "date"),
    f("balance", "number"),
    f("notes", "string", true),
  ],
  scheduled_transactions: [
    ...common,
    f("accountPublicId", "uuid"),
    f("categoryPublicId", "uuid", true),
    f("payee", "string"),
    f("amount", "number"),
    f("rrule", "string"),
    f("nextDueDate", "date", true),
    f("autoPost", "boolean"),
    f("daysInAdvance", "integer", true),
    f("notes", "string", true),
    f("active", "boolean"),
    f("transferToAccountPublicId", "uuid", true),
  ],
  payees: [
    ...common,
    f("name", "string"),
    f("categoryPublicId", "uuid", true),
    f("amount", "number", true),
  ],
  envelope_categories: [
    ...common,
    f("envelopePublicId", "uuid"),
    f("categoryPublicId", "uuid"),
  ],
  budget_allocations: [
    ...common,
    f("envelopePublicId", "uuid"),
    f("month", "month"),
    f("assigned", "number"),
  ],
  budget_transfers: [
    ...common,
    f("fromEnvelopePublicId", "uuid"),
    f("toEnvelopePublicId", "uuid"),
    f("month", "month"),
    f("amount", "number"),
    f("notes", "string", true),
  ],
};

/** Tables whose payload carries the legacy `deleted` flag (SPEC.md 5.5). */
const LEGACY_DELETED_FLAG: ReadonlySet<PortableTable> = new Set([
  "accounts",
  "categories",
]);

export const isSyncTable = (value: unknown): value is PortableTable =>
  typeof value === "string" && Object.hasOwn(SYNC_PAYLOAD_FIELDS, value);

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

const matchesType = (spec: SyncFieldSpec, value: unknown): boolean => {
  if (value === null) return spec.nullable;
  switch (spec.type) {
    case "uuid":
      return typeof value === "string" && UUID_PATTERN.test(value);
    case "string":
      return (
        typeof value === "string" &&
        (spec.enum === undefined || spec.enum.includes(value))
      );
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= -2147483648 &&
        value <= 2147483647
      );
    case "boolean":
      return typeof value === "boolean";
    case "timestamp":
      return typeof value === "string" && TIMESTAMP.test(value);
    case "date":
      return typeof value === "string" && DATE.test(value);
    case "month":
      return typeof value === "string" && MONTH.test(value);
  }
};

/**
 * Why a pulled envelope is invalid (SPEC.md 8.7), or null if it is valid.
 * Unknown payload fields are allowed (section 5.6).
 */
export const envelopeProblem = (value: unknown): string | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "envelope is not an object";
  }
  const e = value as Record<string, unknown>;
  if (!isSyncTable(e.tbl)) return `unknown tbl ${String(e.tbl)}`;
  if (typeof e.publicId !== "string" || !UUID_PATTERN.test(e.publicId)) {
    return "publicId is not a canonical UUID";
  }
  if (typeof e.hlc !== "string" || !HLC_PATTERN.test(e.hlc)) {
    return "hlc does not match the HLC format";
  }
  if (typeof e.deleted !== "boolean") return "deleted is not a boolean";
  const payload = e.payload;
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return "payload is not an object";
  }
  const fields = payload as Record<string, unknown>;
  for (const spec of SYNC_PAYLOAD_FIELDS[e.tbl]) {
    if (!(spec.name in fields)) return `payload is missing ${spec.name}`;
    if (!matchesType(spec, fields[spec.name])) {
      return `payload field ${spec.name} has an invalid value`;
    }
  }
  return null;
};

/** `YYYY-MM-DD HH:MM:SS` (UTC) for a time in milliseconds. */
export const toTimestamp = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 19).replace("T", " ");

/**
 * Receiver normalisation (SPEC.md 5.5): the envelope's `deleted` is
 * authoritative over `deletedAt` and the legacy flag. Also takes the public
 * id from the envelope (section 5.2).
 */
export const normaliseIncomingPayload = (
  envelope: SyncEnvelope,
): SyncPayload => {
  const payload: SyncPayload = {
    ...envelope.payload,
    publicId: envelope.publicId,
  };
  if (!envelope.deleted) {
    payload.deletedAt = null;
  } else if (payload.deletedAt === null || payload.deletedAt === undefined) {
    const wall = parseHlc(envelope.hlc)?.wall;
    if (wall === undefined) throw new Error(`Invalid HLC: ${envelope.hlc}`);
    payload.deletedAt = toTimestamp(wall);
  }
  if (LEGACY_DELETED_FLAG.has(envelope.tbl)) payload.deleted = envelope.deleted;
  return payload;
};

/**
 * Sender side of SPEC.md 5.5: a row is deleted when `deletedAt` is set or,
 * for accounts and categories, the legacy flag is. The payload is made
 * consistent with that (a flag-only delete gets `deletedAt` from the HLC's
 * wall time, exactly what a receiver would store).
 */
export const toOutgoingEnvelope = (
  tbl: PortableTable,
  hlc: string,
  payload: SyncPayload,
): SyncEnvelope => {
  const flagged = LEGACY_DELETED_FLAG.has(tbl) && payload.deleted === true;
  const deleted =
    (payload.deletedAt !== null && payload.deletedAt !== undefined) || flagged;
  const consistent: SyncPayload = { ...payload };
  if (LEGACY_DELETED_FLAG.has(tbl)) consistent.deleted = deleted;
  if (deleted && (payload.deletedAt === null || payload.deletedAt === undefined)) {
    const wall = parseHlc(hlc)?.wall;
    if (wall === undefined) throw new Error(`Invalid HLC: ${hlc}`);
    consistent.deletedAt = toTimestamp(wall);
  }
  const envelope = { tbl, publicId: payload.publicId, hlc, deleted, payload: consistent };
  // Push guard: send nothing a receiver would refuse as `invalid_envelope`.
  const problem = envelopeProblem(envelope);
  if (problem !== null) {
    throw new InvalidOutgoingEnvelopeError(tbl, payload.publicId ?? null, problem);
  }
  return envelope;
};
