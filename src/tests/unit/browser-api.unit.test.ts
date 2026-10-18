import { createBrowserApplicationApi } from "@/platform/browser-api";
import type { BrowserDatabase } from "@/web/db/browser-database";
import { describe, expect, it } from "vitest";

const database = {
  execute: async () => undefined,
  query: async () => [],
  transaction: async (operation: never) => operation,
  migrate: async () => undefined,
  close: async () => undefined,
  ready: Promise.resolve({
    id: 1,
    type: "ready" as const,
    sqliteVersion: "test",
    applied: [],
    skipped: [],
  }),
} as unknown as BrowserDatabase;

describe("browser application API", () => {
  it("maps shared services and rejects native-only backup operations", async () => {
    const api = createBrowserApplicationApi(database);
    expect(api.getAccounts).toBeTypeOf("function");
    expect(() => api.getDefaultBackupFolder()).toThrow(
      "Backups is unavailable in the browser runtime",
    );
    expect(() => api.chooseQifFile()).toThrow(
      "QIF import is unavailable in the browser runtime",
    );
  });
});
