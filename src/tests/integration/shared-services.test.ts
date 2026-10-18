import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createRequire } from "module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/main/db/schema";
import { createMockIpc } from "./helpers/ipc";

// The Electron build registers these handlers (not the legacy per-entity ones),
// over the real better-sqlite3 adapter. Everything the renderer reads through
// window.api must come back in the shared service shape (camelCase, no
// soft-deleted rows), exactly as on the web runtime.
const require = createRequire(import.meta.url);
const registerSharedServices = require("../../../public/ipc/shared-services.js");
const {
  createDatabaseCapability,
} = require("../../../public/services-adapter.js");

describe("Electron shared-services IPC", () => {
  const sqlite = new Database(":memory:");
  const ipc = createMockIpc();
  let accountId = 0;
  let otherAccountId = 0;
  let categoryId = 0;
  let deletedId = 0;

  beforeAll(async () => {
    migrate(drizzle(sqlite, { schema }), {
      migrationsFolder: "src/main/db/migrations",
    });
    registerSharedServices(ipc.ipcMain, createDatabaseCapability(sqlite));

    const account = (name: string) =>
      ipc
        .invoke<{ id: number }[]>("accounts:create", {
          name,
          number: null,
          type: "bank",
          balance: 0,
          currency: "GBP",
          notes: null,
          interestRate: null,
          creditLimit: null,
          pendingReconcileBalance: null,
          pendingReconcileDate: null,
        })
        .then((rows) => rows[0]!.id);
    accountId = await account("Main");
    otherAccountId = await account("Other");
    categoryId = (
      await ipc.invoke<{ id: number }[]>("categories:create", {
        name: "Groceries",
        parentId: null,
        expenseType: "expense",
      })
    )[0]!.id;

    const tx = async (account: number, date: string, payee: string) =>
      (
        await ipc.invoke<{ id: number }[]>("transactions:create", {
          accountId: account,
          date,
          payee,
          amount: -10,
          categoryId,
          notes: null,
          cleared: false,
        })
      )[0]!.id;
    await tx(accountId, "2026-03-01", "In range");
    await tx(accountId, "2026-01-01", "Too early");
    await tx(otherAccountId, "2026-03-02", "Other account");
    deletedId = await tx(accountId, "2026-03-03", "Deleted");
    await ipc.invoke("transactions:delete", deletedId);
  });

  afterAll(() => sqlite.close());

  it("getByDateRange returns camelCase rows without deleted transactions", async () => {
    const rows = await ipc.invoke<
      { payee: string; accountId: number; categoryId: number | null }[]
    >("transactions:getByDateRange", "2026-02-01", "2026-03-31");

    expect(rows.map((r) => r.payee).sort()).toEqual([
      "In range",
      "Other account",
    ]);
    for (const row of rows) {
      expect(row.categoryId).toBe(categoryId);
      expect(row).not.toHaveProperty("category_id");
    }
  });

  it("getByDateRange filters by account", async () => {
    const rows = await ipc.invoke<{ payee: string; accountId: number }[]>(
      "transactions:getByDateRange",
      "2026-02-01",
      "2026-03-31",
      [accountId],
    );
    expect(rows.map((r) => r.payee)).toEqual(["In range"]);
    expect(rows[0]!.accountId).toBe(accountId);
  });
});
