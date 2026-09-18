import * as schema from "@/main/db/schema";
import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import {
  createTransaction,
  createTransactionService,
} from "@/services/transactions";
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

describe("transaction creation service", () => {
  it("creates linked opposite transactions for transfer categories", async () => {
    const database = createDatabase();
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank'), ('Savings', 'bank')",
    });
    await database.execute({
      sql: "INSERT INTO categories (name, expense_type) VALUES ('Transfer', 'transfer')",
    });
    const [{ id: transferParentId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Transfer' AND parent_id IS NULL",
    });
    await database.execute({
      sql: "INSERT INTO categories (parent_id, name, expense_type) VALUES (?, 'Savings', 'transfer'), (?, 'Checking', 'transfer')",
      params: [transferParentId, transferParentId],
    });
    const [{ id: savingsCategoryId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Savings' AND parent_id = ?",
      params: [transferParentId],
    });

    const [created] = await createTransaction(database, {
      accountId: 1,
      categoryId: savingsCategoryId,
      date: "2026-01-01",
      payee: "Move money",
      amount: 100,
      notes: null,
      cleared: false,
    });

    expect(created.transferTransactionId).toBeTypeOf("number");
    await expect(
      database.query<{
        account_id: number;
        amount: number;
        transfer_transaction_id: number | null;
      }>({
        sql: "SELECT account_id, amount, transfer_transaction_id FROM transactions ORDER BY id",
      }),
    ).resolves.toEqual([
      { account_id: 1, amount: 100, transfer_transaction_id: 2 },
      { account_id: 2, amount: -100, transfer_transaction_id: 1 },
    ]);
  });

  it("creates a normal transaction when the transfer target is missing", async () => {
    const database = createDatabase();
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank')",
    });
    await database.execute({
      sql: "INSERT INTO categories (name, expense_type) VALUES ('Transfer', 'transfer')",
    });
    const [{ id: transferParentId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Transfer' AND parent_id IS NULL",
    });
    await database.execute({
      sql: "INSERT INTO categories (parent_id, name, expense_type) VALUES (?, 'Missing', 'transfer')",
      params: [transferParentId],
    });
    const [{ id: missingCategoryId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Missing' AND parent_id = ?",
      params: [transferParentId],
    });

    const [created] = await createTransaction(database, {
      accountId: 1,
      categoryId: missingCategoryId,
      date: "2026-01-01",
      payee: "Move money",
      amount: 100,
      notes: null,
      cleared: false,
    });

    expect(created.transferTransactionId).toBeNull();
  });

  it("deletes an un-reconciled transaction atomically", async () => {
    const database = createDatabase();
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank'), ('Savings', 'bank')",
    });
    const service = createTransactionService(database);
    const [created] = await createTransaction(database, {
      accountId: 1,
      categoryId: null,
      date: "2026-01-01",
      payee: "Test",
      amount: 10,
      notes: null,
      cleared: false,
    });
    await service.delete(created.id);
    await expect(
      database.query({
        sql: "SELECT deleted_at FROM transactions WHERE id = ?",
        params: [created.id],
      }),
    ).resolves.toEqual([{ deleted_at: expect.any(String) }]);
  });

  it("rejects deletion of reconciled transactions", async () => {
    const database = createDatabase();
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank')",
    });
    const service = createTransactionService(database);
    const [created] = await createTransaction(database, {
      accountId: 1,
      categoryId: null,
      date: "2026-01-01",
      payee: "Test",
      amount: 10,
      notes: null,
      cleared: false,
    });
    await database.execute({
      sql: "UPDATE transactions SET reconciled = 1 WHERE id = ?",
      params: [created.id],
    });
    await expect(service.delete(created.id)).rejects.toThrow("reconciled");
  });

  it("propagates editable fields to an unreconciled transfer counter", async () => {
    const database = createDatabase();
    const service = createTransactionService(database);
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank'), ('Savings', 'bank')",
    });
    await database.execute({
      sql: "INSERT INTO categories (name, expense_type) VALUES ('Transfer', 'transfer')",
    });
    const [{ id: parentId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Transfer' AND parent_id IS NULL",
    });
    await database.execute({
      sql: "INSERT INTO categories (parent_id, name, expense_type) VALUES (?, 'Savings', 'transfer'), (?, 'Checking', 'transfer')",
      params: [parentId, parentId],
    });
    const [{ id: categoryId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Savings' AND parent_id = ?",
      params: [parentId],
    });
    const [created] = await createTransaction(database, {
      accountId: 1,
      categoryId,
      date: "2026-01-01",
      payee: "Original",
      amount: 10,
      notes: null,
      cleared: false,
    });

    await service.update(created.id, { amount: 25, payee: "Updated" });

    await expect(
      database.query({
        sql: "SELECT amount, payee FROM transactions ORDER BY id",
      }),
    ).resolves.toEqual([
      { amount: 25, payee: "Updated" },
      { amount: -25, payee: "Updated" },
    ]);
  });

  it("creates a counter when a normal transaction becomes a transfer", async () => {
    const database = createDatabase();
    const service = createTransactionService(database);
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank'), ('Savings', 'bank')",
    });
    await database.execute({
      sql: "INSERT INTO categories (name, expense_type) VALUES ('Transfer', 'transfer')",
    });
    const [{ id: parentId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Transfer' AND parent_id IS NULL",
    });
    await database.execute({
      sql: "INSERT INTO categories (parent_id, name, expense_type) VALUES (?, 'Savings', 'transfer'), (?, 'Checking', 'transfer')",
      params: [parentId, parentId],
    });
    const [{ id: savingsCategoryId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Savings' AND parent_id = ?",
      params: [parentId],
    });
    const [created] = await createTransaction(database, {
      accountId: 1,
      categoryId: null,
      date: "2026-01-01",
      payee: "Move money",
      amount: 100,
      notes: null,
      cleared: false,
    });

    const [updated] = await service.update(created.id, {
      categoryId: savingsCategoryId,
    });

    expect(updated.transferTransactionId).toBeTypeOf("number");
    await expect(
      database.query({ sql: "SELECT count(*) AS count FROM transactions" }),
    ).resolves.toEqual([{ count: 2 }]);
  });

  it("removes a counter when a transfer becomes normal", async () => {
    const database = createDatabase();
    const service = createTransactionService(database);
    await database.execute({
      sql: "INSERT INTO accounts (name, type) VALUES ('Checking', 'bank'), ('Savings', 'bank')",
    });
    await database.execute({
      sql: "INSERT INTO categories (name, expense_type) VALUES ('Transfer', 'transfer')",
    });
    const [{ id: parentId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Transfer' AND parent_id IS NULL",
    });
    await database.execute({
      sql: "INSERT INTO categories (parent_id, name, expense_type) VALUES (?, 'Savings', 'transfer'), (?, 'Checking', 'transfer')",
      params: [parentId, parentId],
    });
    const [{ id: savingsCategoryId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Savings' AND parent_id = ?",
      params: [parentId],
    });
    const [created] = await createTransaction(database, {
      accountId: 1,
      categoryId: savingsCategoryId,
      date: "2026-01-01",
      payee: "Move money",
      amount: 100,
      notes: null,
      cleared: false,
    });

    const [updated] = await service.update(created.id, { categoryId: null });

    expect(updated.categoryId).toBeNull();
    expect(updated.transferTransactionId).toBeNull();
    await expect(
      database.query({
        sql: "SELECT count(*) AS count FROM transactions WHERE deleted_at IS NULL",
      }),
    ).resolves.toEqual([{ count: 1 }]);
  });
});
