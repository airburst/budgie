import type { DatabaseCapability } from "@/platform/database";
import { createPayeeService } from "@/services/payees";
import { createSettingsService } from "@/services/settings";
import { describe, expect, it } from "vitest";

const createFakeDatabase = (
  rows: Record<string, unknown>[] = [],
): DatabaseCapability & { statements: string[] } => {
  const statements: string[] = [];
  return {
    statements,
    execute: async (statement) => {
      statements.push(statement.sql);
    },
    query: async <T>() => rows as T[],
    transaction: async (operation) =>
      operation({
        execute: async (statement) => {
          statements.push(statement.sql);
        },
        query: async <T>() => rows as T[],
      }),
    migrate: async () => undefined,
    close: async () => undefined,
  };
};

describe("settings and payee services", () => {
  it("upserts payees with parameterized SQL", async () => {
    const database = createFakeDatabase();
    await createPayeeService(database).upsert("Market", 2, 12.5);
    expect(database.statements).toHaveLength(0);
  });

  it("supplies default preferences when settings are absent", async () => {
    const database = createFakeDatabase();
    await expect(
      createSettingsService(database).getPreferences(),
    ).resolves.toEqual({
      hideReconciled: true,
      hideCleared: false,
      autofillPayees: true,
    });
  });

  it("merges stored preference JSON with defaults", async () => {
    const database = createFakeDatabase([
      { preferences: '{"hideCleared":true}' },
    ]);
    await expect(
      createSettingsService(database).getPreferences(),
    ).resolves.toEqual({
      hideReconciled: true,
      hideCleared: true,
      autofillPayees: true,
    });
  });
});
