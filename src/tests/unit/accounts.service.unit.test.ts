import * as schema from "@/main/db/schema";
import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import { createAccountService } from "@/services/accounts";
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

  const transaction = (): DatabaseTransaction => ({
    execute: async (statement) => {
      sqlite.prepare(statement.sql).run(...(statement.params ?? []));
    },
    query: async <T extends DatabaseRow>(statement: DatabaseStatement) =>
      sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as T[],
  });

  return {
    execute: async (statement) => {
      sqlite.prepare(statement.sql).run(...(statement.params ?? []));
    },
    query: async <T extends DatabaseRow>(statement: DatabaseStatement) =>
      sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as T[],
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

describe("accounts service", () => {
  it("creates accounts and their transfer categories", async () => {
    const database = createDatabase();
    await database.execute({
      sql: "INSERT INTO categories (name, expense_type) VALUES ('Transfer', 'transfer')",
    });
    const service = createAccountService(database);

    const [account] = await service.create({
      name: "Checking",
      number: null,
      type: "bank",
      balance: 100,
      currency: "GBP",
      notes: null,
      interestRate: null,
      creditLimit: null,
      pendingReconcileBalance: null,
      pendingReconcileDate: null,
    });

    expect(account.name).toBe("Checking");
    expect(await service.getAll()).toEqual([
      expect.objectContaining({
        name: "Checking",
        computedBalance: 100,
        clearedBalance: 100,
      }),
    ]);
    await expect(
      database.query({
        sql: "SELECT name FROM categories WHERE name = 'Checking' AND parent_id IS NOT NULL",
      }),
    ).resolves.toEqual([{ name: "Checking" }]);
  });

  it("soft deletes accounts referenced by transactions", async () => {
    const database = createDatabase();
    const service = createAccountService(database);
    const [account] = await service.create({
      name: "Checking",
      number: null,
      type: "bank",
      balance: 0,
      currency: "GBP",
      notes: null,
      interestRate: null,
      creditLimit: null,
      pendingReconcileBalance: null,
      pendingReconcileDate: null,
    });
    await database.execute({
      sql: "INSERT INTO transactions (account_id, date, payee, amount) VALUES (?, '2026-01-01', 'Test', 25)",
      params: [account.id],
    });

    await service.delete(account.id);

    await expect(
      database.query({
        sql: "SELECT deleted FROM accounts WHERE id = ?",
        params: [account.id],
      }),
    ).resolves.toEqual([{ deleted: 1 }]);
    await expect(service.getAll()).resolves.toEqual([]);
  });
});
