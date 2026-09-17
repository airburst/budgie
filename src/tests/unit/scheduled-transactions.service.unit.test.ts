import * as schema from "@/main/db/schema";
import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import { processAutoPost } from "@/services/scheduled-transactions";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";

const databases: Database.Database[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const createDatabase = (): DatabaseCapability => {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  migrate(drizzle(sqlite, { schema }), {
    migrationsFolder: "src/main/db/migrations",
  });
  const execute = (statement: DatabaseStatement) =>
    sqlite.prepare(statement.sql).run(...(statement.params ?? []));
  const query = <T extends DatabaseRow>(statement: DatabaseStatement) =>
    sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as T[];
  const transaction = (): DatabaseTransaction => ({
    execute: async (statement) => execute(statement),
    query: async (statement) => query(statement),
  });
  return {
    execute: async (statement) => execute(statement),
    query: async (statement) => query(statement),
    transaction: async <T>(
      operation: (tx: DatabaseTransaction) => Promise<T>,
    ) => {
      sqlite.exec("BEGIN;");
      try {
        const result = await operation(transaction());
        sqlite.exec("COMMIT;");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK;");
        throw error;
      }
    },
    migrate: async () => undefined,
    close: async () => sqlite.close(),
  };
};

describe("scheduled auto-post service", () => {
  it("posts overdue schedules and advances or removes them", async () => {
    const database = createDatabase();
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank')",
    });
    await database.execute({
      sql: `INSERT INTO scheduled_transactions
        (account_id, payee, amount, rrule, next_due_date, auto_post, active)
        VALUES (1, 'Rent', -50, 'FREQ=DAILY;COUNT=1', '2026-01-01', 1, 1)`,
    });

    await processAutoPost(database, new Date("2026-01-02T00:00:00Z"));

    await expect(
      database.query({ sql: "SELECT amount, payee FROM transactions" }),
    ).resolves.toEqual([{ amount: -50, payee: "Rent" }]);
    await expect(
      database.query({
        sql: "SELECT count(*) AS count FROM scheduled_transactions",
      }),
    ).resolves.toEqual([{ count: 0 }]);
  });
});
