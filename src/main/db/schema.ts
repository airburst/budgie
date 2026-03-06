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
  createdAt: text("created_at").default(new Date().toISOString()),
});
