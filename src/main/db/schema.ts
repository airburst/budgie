import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const now = () => new Date().toISOString();

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
  createdAt: text("created_at").$defaultFn(now),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  parentId: integer("parent_id").references(
    (): AnySQLiteColumn => categories.id,
  ),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  createdAt: text("created_at").$defaultFn(now),
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
  createdAt: text("created_at").$defaultFn(now),
});

export const accountReconciliations = sqliteTable("account_reconciliations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id),
  date: text("date").notNull(),
  balance: real("balance").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(now),
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
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").$defaultFn(now),
});
