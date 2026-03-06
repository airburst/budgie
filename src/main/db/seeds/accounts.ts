/// <reference types="bun-types" />
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import path from "path";
import * as schema from "../schema";

const projectRoot = path.join(import.meta.dir, "../../../../");
const TEST_DB_PATH = path.join(projectRoot, "test.db");
const migrationsPath = path.join(import.meta.dir, "../migrations");

const sqlite = new Database(TEST_DB_PATH);
const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: migrationsPath });

await db.insert(schema.accounts).values([
  {
    name: "Monzo Current Account",
    number: "12-34-56 12345678",
    type: "bank",
    balance: 2450.0,
    currency: "GBP",
    notes: "Main everyday spending account",
  },
  {
    name: "Amex Cashback Card",
    number: "3714 496353 98431",
    type: "credit_card",
    balance: -342.5,
    currency: "GBP",
    notes: "Paid in full each month",
  },
  {
    name: "Marcus Savings",
    number: "98-76-54 87654321",
    type: "bank",
    balance: 10000.0,
    currency: "GBP",
    notes: "Emergency fund — 6 months expenses",
  },
]);

console.log("Seeded 3 accounts into", TEST_DB_PATH);
sqlite.close();
