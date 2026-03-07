import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import { ACCOUNT_A } from "./helpers/fixtures";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

describe("categories IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  // ── Seeded data ────────────────────────────────────────────────────────────

  it("seeded categories are present on a fresh DB", async () => {
    const all = await invoke<{ name: string }[]>("categories:getAll");
    const names = all.map((c) => c.name);
    expect(names).toContain("Salary");
    expect(names).toContain("Food");
    expect(names).toContain("Groceries");
    expect(names).toContain("Council Tax");
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────

  let freelanceCatId: number;
  let subCatId: number;

  it("create top-level income category — parentId is null", async () => {
    const rows = await invoke<{ id: number; parentId: number | null }[]>(
      "categories:create",
      { name: "Freelance Income", expenseType: "income" },
    );
    freelanceCatId = rows[0].id;
    expect(rows[0].parentId).toBeNull();

    const found = await invoke<{ name: string; expenseType: string } | null>(
      "categories:getById",
      freelanceCatId,
    );
    expect(found?.name).toBe("Freelance Income");
    expect(found?.expenseType).toBe("income");
  });

  it("create child category — parentId links to parent", async () => {
    // Find the seeded "Bills" category to use as parent
    const all =
      await invoke<{ id: number; name: string }[]>("categories:getAll");
    const bills = all.find((c) => c.name === "Bills");
    expect(bills).toBeDefined();

    const rows = await invoke<{ id: number; parentId: number | null }[]>(
      "categories:create",
      { name: "Electricity", expenseType: "expense", parentId: bills!.id },
    );
    subCatId = rows[0].id;
    expect(rows[0].parentId).toBe(bills!.id);
  });

  it("update category name — reflected in getById", async () => {
    await invoke("categories:update", freelanceCatId, {
      name: "Contract Work",
    });
    const found = await invoke<{ name: string } | null>(
      "categories:getById",
      freelanceCatId,
    );
    expect(found?.name).toBe("Contract Work");
  });

  // ── Delete: hard-delete (no linked transactions) ──────────────────────────

  it("hard-delete: category with no transactions is removed from DB", async () => {
    // Create a throwaway category then delete it
    const rows = await invoke<{ id: number }[]>("categories:create", {
      name: "Throwaway",
      expenseType: "expense",
    });
    const throwawayId = rows[0].id;

    await invoke("categories:delete", throwawayId);

    const found = await invoke<unknown | null>(
      "categories:getById",
      throwawayId,
    );
    expect(found).toBeNull();
  });

  it("getAll excludes hard-deleted categories", async () => {
    const all = await invoke<{ name: string }[]>("categories:getAll");
    expect(all.map((c) => c.name)).not.toContain("Throwaway");
  });

  // ── Delete: soft-delete (linked transactions prevent hard-delete) ─────────

  let softDeleteCatId: number;

  it("soft-delete: category with linked transactions is marked deleted, not removed", async () => {
    // Create a category to soft-delete
    const catRows = await invoke<{ id: number }[]>("categories:create", {
      name: "SoftDeleteMe",
      expenseType: "expense",
    });
    softDeleteCatId = catRows[0].id;

    // Create an account + transaction referencing that category
    const acctRows = await invoke<{ id: number }[]>(
      "accounts:create",
      ACCOUNT_A,
    );
    const acctId = acctRows[0].id;
    await invoke("transactions:create", {
      accountId: acctId,
      categoryId: softDeleteCatId,
      date: "2026-01-01",
      payee: "Test Payee",
      amount: -10,
      cleared: false,
    });

    // Deleting the category should soft-delete (FK prevents hard-delete)
    await invoke("categories:delete", softDeleteCatId);

    // getAll should NOT return the soft-deleted category
    const all = await invoke<{ name: string }[]>("categories:getAll");
    expect(all.map((c) => c.name)).not.toContain("SoftDeleteMe");

    // getById should still return it (with deleted=true)
    const found = await invoke<{ name: string; deleted: boolean } | null>(
      "categories:getById",
      softDeleteCatId,
    );
    expect(found).not.toBeNull();
    expect(found?.deleted).toBe(true);
  });

  // ── Verify cleanup ─────────────────────────────────────────────────────────

  it("sub-category created earlier is still present in getAll", async () => {
    const all = await invoke<{ id: number }[]>("categories:getAll");
    expect(all.some((c) => c.id === subCatId)).toBe(true);
  });
});
