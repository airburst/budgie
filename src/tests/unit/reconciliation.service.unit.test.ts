import * as schema from "@/main/db/schema";
import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import { reconcileTransactions } from "@/services/reconciliation";
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

describe("reconciliation service", () => {
  it("updates transaction flags and inserts a checkpoint atomically", async () => {
    const database = createDatabase();
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank')",
    });
    await database.execute({
      sql: "INSERT INTO transactions (account_id, date, payee, amount) VALUES (1, '2026-01-01', 'Test', 10)",
    });

    const [checkpoint] = await reconcileTransactions(database, {
      toReconcile: [1],
      toUnclear: [],
      checkpoint: {
        accountId: 1,
        date: "2026-01-02",
        balance: 10,
        notes: null,
      },
    });

    expect(checkpoint).toMatchObject({ accountId: 1, balance: 10 });
    await expect(
      database.query({
        sql: "SELECT cleared, reconciled FROM transactions WHERE id = 1",
      }),
    ).resolves.toEqual([{ cleared: 1, reconciled: 1 }]);
  });

  it("rolls back transaction flags when checkpoint insertion fails", async () => {
    const database = createDatabase();
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank')",
    });
    await database.execute({
      sql: "INSERT INTO transactions (account_id, date, payee, amount) VALUES (1, '2026-01-01', 'Test', 10)",
    });

    await expect(
      reconcileTransactions(database, {
        toReconcile: [1],
        toUnclear: [],
        checkpoint: {
          accountId: 1,
          date: null as never,
          balance: 10,
          notes: null,
        },
      }),
    ).rejects.toThrow();
    await expect(
      database.query({
        sql: "SELECT cleared, reconciled FROM transactions WHERE id = 1",
      }),
    ).resolves.toEqual([{ cleared: 0, reconciled: 0 }]);
  });
});
