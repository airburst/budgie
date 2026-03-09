import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  number: text("number"),
  type: text("type", {
    enum: ["bank", "credit_card", "loan", "investment", "cash"],
  }).notNull(),
  balance: real("balance").notNull().default(0),
  currency: text("currency").notNull().default("GBP"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  preferences: text("preferences").notNull().default("{}"),
});

export const payees = sqliteTable("payees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  categoryId: integer("category_id").references(() => categories.id),
  amount: real("amount"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});
