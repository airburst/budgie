import type { DatabaseCapability } from "@/platform/database";
import { describe, expect, it } from "vitest";
import * as services from "../../../public/services.js";

const fakeDatabase = (): DatabaseCapability => ({
  execute: async () => undefined,
  query: async () => [],
  transaction: async (operation) =>
    operation({
      execute: async () => undefined,
      query: async () => [],
    }),
  migrate: async () => undefined,
  close: async () => undefined,
});

describe("built shared service bundle", () => {
  it("exports every database-domain factory used by Electron", () => {
    expect(
      Object.keys(services)
        .filter((key) => key !== "default")
        .sort(),
    ).toEqual([
      "createAccountReconciliationService",
      "createAccountService",
      "createBudgetService",
      "createCategoryService",
      "createEnvelopeService",
      "createPayeeService",
      "createReconciliationService",
      "createScheduledTransactionService",
      "createSettingsService",
      "createTransactionService",
      "processAutoPost",
    ]);
  });

  it("constructs all factories against the shared capability shape", () => {
    const database = fakeDatabase();
    expect(services.createAccountService(database)).toBeDefined();
    expect(services.createAccountReconciliationService(database)).toBeDefined();
    expect(services.createBudgetService(database)).toBeDefined();
    expect(services.createCategoryService(database)).toBeDefined();
    expect(services.createEnvelopeService(database)).toBeDefined();
    expect(services.createPayeeService(database)).toBeDefined();
    expect(services.createReconciliationService(database)).toBeDefined();
    expect(services.createScheduledTransactionService(database)).toBeDefined();
    expect(services.createSettingsService(database)).toBeDefined();
    expect(services.createTransactionService(database)).toBeDefined();
  });
});
