import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import {
  check,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Sync bookkeeping. Triggers (migrations 0013 and 0014) maintain these; see the
// header of 0014_sync_state.sql for the rules the sync engine must follow.
const syncMetadata = {
  publicId: text("public_id"),
  updatedAt: text("updated_at"),
  deletedAt: text("deleted_at"),
  hlc: text("hlc"),
  syncDirty: integer("sync_dirty", { mode: "boolean" })
    .notNull()
    .default(false),
  syncUnsealed: integer("sync_unsealed", { mode: "boolean" })
    .notNull()
    .default(false),
  syncRev: integer("sync_rev").notNull().default(0),
};

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  name: text("name").notNull(),
  number: text("number"),
  type: text("type", {
    enum: ["bank", "credit_card", "loan", "investment", "cash"],
  }).notNull(),
  balance: real("balance").notNull().default(0),
  currency: text("currency").notNull().default("GBP"),
  notes: text("notes"),
  interestRate: real("interest_rate"),
  creditLimit: real("credit_limit"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  pendingReconcileBalance: real("pending_reconcile_balance"),
  pendingReconcileDate: text("pending_reconcile_date"),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  parentId: integer("parent_id").references(
    (): AnySQLiteColumn => categories.id,
  ),
  name: text("name").notNull(),
  expenseType: text("expense_type", { enum: ["expense", "income", "transfer"] })
    .notNull()
    .default("expense"),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  categoryId: integer("category_id").references(() => categories.id),
  date: text("date").notNull(),
  payee: text("payee").notNull(),
  amount: real("amount").notNull(),
  notes: text("notes"),
  cleared: integer("cleared", { mode: "boolean" }).notNull().default(false),
  reconciled: integer("reconciled", { mode: "boolean" })
    .notNull()
    .default(false),
  transferTransactionId: integer("transfer_transaction_id").references(
    (): AnySQLiteColumn => transactions.id,
  ),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const accountReconciliations = sqliteTable("account_reconciliations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  date: text("date").notNull(),
  balance: real("balance").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const scheduledTransactions = sqliteTable("scheduled_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  categoryId: integer("category_id").references(() => categories.id),
  payee: text("payee").notNull(),
  amount: real("amount").notNull(),
  rrule: text("rrule").notNull(),
  nextDueDate: text("next_due_date"),
  autoPost: integer("auto_post", { mode: "boolean" }).notNull().default(false),
  daysInAdvance: integer("days_in_advance"),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  transferToAccountId: integer("transfer_to_account_id").references(
    () => accounts.id,
  ),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  preferences: text("preferences").notNull().default("{}"),
});

export const payees = sqliteTable("payees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  name: text("name").notNull().unique(),
  categoryId: integer("category_id").references(() => categories.id),
  amount: real("amount"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const envelopes = sqliteTable("envelopes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const envelopeCategories = sqliteTable("envelope_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  envelopeId: integer("envelope_id")
    .notNull()
    .references(() => envelopes.id),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id)
    .unique(),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const budgetAllocations = sqliteTable("budget_allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  envelopeId: integer("envelope_id")
    .notNull()
    .references(() => envelopes.id),
  month: text("month").notNull(),
  assigned: real("assigned").notNull().default(0),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const budgetTransfers = sqliteTable("budget_transfers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...syncMetadata,
  fromEnvelopeId: integer("from_envelope_id")
    .notNull()
    .references(() => envelopes.id),
  toEnvelopeId: integer("to_envelope_id")
    .notNull()
    .references(() => envelopes.id),
  month: text("month").notNull(),
  amount: real("amount").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

// Single-row sync configuration and progress (id is always 1). Exempt from the
// entity CRUD rule: only the sync engine reads and writes it.
export const syncState = sqliteTable(
  "sync_state",
  {
    id: integer("id").primaryKey(),
    deviceId: text("device_id"),
    serverUrl: text("server_url"),
    token: text("token"),
    cursor: text("cursor"),
    lastSyncedAt: text("last_synced_at"),
    lastError: text("last_error"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    consentAt: text("consent_at"),
    consentAppVersion: text("consent_app_version"),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [check("sync_state_single_row", sql`${table.id} = 1`)],
);

// Tombstone store (migration 0015, SPEC.md 8.10): deleted rows of the three
// natural-key tables that would otherwise block a live row's key under the
// tables' UNIQUE constraints. A row here is still a row of `tbl` for every
// sync purpose; see the header of 0015_sync_tombstones.sql. Exempt from the
// entity CRUD rule: only the sync engine and portable import/export use it.
export const syncTombstones = sqliteTable(
  "sync_tombstones",
  {
    tbl: text("tbl").notNull(),
    publicId: text("public_id").notNull(),
    hlc: text("hlc"),
    dirty: integer("dirty", { mode: "boolean" }).notNull().default(false),
    unsealed: integer("unsealed", { mode: "boolean" }).notNull().default(false),
    payload: text("payload").notNull(),
    createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    primaryKey({ columns: [table.tbl, table.publicId] }),
    check(
      "sync_tombstones_tbl",
      sql`${table.tbl} IN ('payees', 'envelope_categories', 'budget_allocations')`,
    ),
  ],
);
