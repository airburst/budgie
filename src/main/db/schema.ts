import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", {
    enum: ["checking", "savings", "credit_card", "loan", "investment", "cash"],
  }).notNull(),
  institution: text("institution"),
  balance: real("balance").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  color: text("color"),
  createdAt: text("created_at").default(new Date().toISOString()),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  completed: integer("completed", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(new Date().toISOString()),
});
