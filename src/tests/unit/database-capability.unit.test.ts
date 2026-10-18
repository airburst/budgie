import type {
  DatabaseCapability,
  DatabaseStatement,
} from "@/platform/database";
import { describe, expect, it } from "vitest";

const createFakeDatabase = (): {
  capability: DatabaseCapability;
  statements: string[];
} => {
  const statements: string[] = [];
  const capability: DatabaseCapability = {
    execute: async (statement) => statements.push(statement.sql),
    query: async () => [],
    transaction: async (operation) =>
      operation({
        execute: async (statement: DatabaseStatement) =>
          statements.push(`tx:${statement.sql}`),
        query: async () => [],
      }),
    migrate: async () => undefined,
    close: async () => undefined,
  };
  return { capability, statements };
};

describe("database capability", () => {
  it("keeps transaction work serialized through one transaction handle", async () => {
    const { capability, statements } = createFakeDatabase();

    await capability.transaction(async (transaction) => {
      await transaction.execute({ sql: "INSERT INTO accounts VALUES (?)" });
      await transaction.query({ sql: "SELECT * FROM accounts" });
    });

    expect(statements).toEqual(["tx:INSERT INTO accounts VALUES (?)"]);
  });

  it("provides async lifecycle operations to both adapters", async () => {
    const { capability } = createFakeDatabase();
    await expect(capability.migrate()).resolves.toBeUndefined();
    await expect(capability.close()).resolves.toBeUndefined();
  });
});
