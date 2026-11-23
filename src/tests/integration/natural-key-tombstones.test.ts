// SY-009: creating a row whose natural key is held by a soft-deleted row.
// The three tables with natural keys keep a plain UNIQUE constraint that also
// covers deleted rows, so the services must revive the tombstone (same row,
// same public id) instead of inserting a second row.
import { createRequire } from "module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBudgetService } from "@/services/budgets";
import { createCategoryService } from "@/services/categories";
import { createEnvelopeService } from "@/services/envelopes";
import { createPayeeService } from "@/services/payees";
import { createTestDb, type TestDb } from "./helpers/db";

const require = createRequire(import.meta.url);
const {
  createDatabaseCapability,
} = require("../../../public/services-adapter.js");

type Raw = { public_id: string; deleted_at: string | null };

describe("natural keys held by soft-deleted rows", () => {
  let test: TestDb;
  let sqlite: import("better-sqlite3").Database;
  let payees: ReturnType<typeof createPayeeService>;
  let budgets: ReturnType<typeof createBudgetService>;
  let envelopes: ReturnType<typeof createEnvelopeService>;
  let categoryId = 0;
  let envelopeId = 0;
  let otherEnvelopeId = 0;

  const rows = (table: string, where: string, params: unknown[]) =>
    sqlite
      .prepare(`SELECT public_id, deleted_at FROM ${table} WHERE ${where}`)
      .all(...params) as Raw[];

  // INSERT ... RETURNING runs before the AFTER INSERT trigger that assigns
  // public_id, so read it back from the table.
  const publicIdOf = (table: string, id: number) =>
    (
      sqlite.prepare(`SELECT public_id FROM ${table} WHERE id = ?`).get(id) as {
        public_id: string;
      }
    ).public_id;

  beforeAll(async () => {
    test = createTestDb();
    sqlite = test.db.$client;
    const database = createDatabaseCapability(sqlite);
    payees = createPayeeService(database);
    budgets = createBudgetService(database);
    envelopes = createEnvelopeService(database);
    const categories = createCategoryService(database);
    categoryId = (
      await categories.create({
        name: "Natural key groceries",
        parentId: null,
        expenseType: "expense",
      })
    )[0]!.id;
    envelopeId = (
      await envelopes.create({ name: "Food", active: true, sortOrder: 0 })
    )[0]!.id;
    otherEnvelopeId = (
      await envelopes.create({ name: "Treats", active: true, sortOrder: 1 })
    )[0]!.id;
  });

  afterAll(() => test.teardown());

  it("payees.create revives a deleted payee with the same name", async () => {
    const first = (
      await payees.create({
        name: "Corner shop",
        categoryId: null,
        amount: null,
      })
    )[0]!;
    const publicId = publicIdOf("payees", first.id);
    await payees.delete(first.id);

    const again = (
      await payees.create({
        name: "Corner shop",
        categoryId,
        amount: 12.5,
      })
    )[0]!;

    expect(again.id).toBe(first.id);
    expect(again.publicId).toBe(publicId);
    expect(again.deletedAt).toBeNull();
    expect(again.categoryId).toBe(categoryId);
    expect(again.amount).toBe(12.5);
    expect(rows("payees", "name = ?", ["Corner shop"])).toHaveLength(1);
    expect((await payees.getAll()).map((p) => p.name)).toContain("Corner shop");
  });

  it("payees.upsert revives a deleted payee with the same name", async () => {
    const first = (
      await payees.create({
        name: "Bakery",
        categoryId: null,
        amount: null,
      })
    )[0]!;
    await payees.delete(first.id);

    const again = (await payees.upsert("Bakery", categoryId, 3))[0]!;

    expect(again.id).toBe(first.id);
    expect(again.deletedAt).toBeNull();
    expect(again.amount).toBe(3);
    expect((await payees.getAll()).map((p) => p.name)).toContain("Bakery");
  });

  it("payees.create still refuses a live duplicate name", async () => {
    await payees.create({ name: "Garage", categoryId: null, amount: null });
    await expect(
      payees.create({ name: "Garage", categoryId: null, amount: null }),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("envelopes.createCategory revives a deleted link for the category", async () => {
    const first = (
      await envelopes.createCategory({
        envelopeId,
        categoryId,
      })
    )[0]!;
    const publicId = publicIdOf("envelope_categories", first.id);
    await envelopes.deleteCategory(first.id);

    const again = (
      await envelopes.createCategory({
        envelopeId: otherEnvelopeId,
        categoryId,
      })
    )[0]!;

    expect(again.id).toBe(first.id);
    expect(again.publicId).toBe(publicId);
    expect(again.envelopeId).toBe(otherEnvelopeId);
    expect(again.deletedAt).toBeNull();
    expect(
      rows("envelope_categories", "category_id = ?", [categoryId]),
    ).toHaveLength(1);
  });

  it("budgets.upsertAllocation revives a deleted (envelope, month) allocation", async () => {
    const first = (
      await budgets.upsertAllocation(envelopeId, "2026-03", 100)
    )[0]!;
    const publicId = publicIdOf("budget_allocations", first.id);
    await budgets.deleteAllocation(first.id);

    const again = (
      await budgets.upsertAllocation(envelopeId, "2026-03", 80)
    )[0]!;

    expect(again.id).toBe(first.id);
    expect(again.publicId).toBe(publicId);
    expect(again.assigned).toBe(80);
    expect(again.deletedAt).toBeNull();
    expect(
      rows("budget_allocations", "envelope_id = ? AND month = ?", [
        envelopeId,
        "2026-03",
      ]),
    ).toHaveLength(1);
  });

  it("budgets.quickFillAllocations fills a month whose allocation was deleted", async () => {
    await budgets.upsertAllocation(envelopeId, "2026-04", 55);
    const target = (
      await budgets.upsertAllocation(envelopeId, "2026-05", 10)
    )[0]!;
    await budgets.deleteAllocation(target.id);

    const inserted = await budgets.quickFillAllocations("2026-05", "2026-04");

    expect(inserted.map((row) => [row.id, row.assigned])).toEqual([
      [target.id, 55],
    ]);
    expect(
      (await budgets.getAllocationsByMonth("2026-05")).map((row) => [
        row.envelopeId,
        row.assigned,
      ]),
    ).toEqual([[envelopeId, 55]]);
  });

  it("budgets.quickFillAllocations leaves live allocations alone", async () => {
    await budgets.upsertAllocation(envelopeId, "2026-06", 1);
    await budgets.upsertAllocation(envelopeId, "2026-07", 2);
    expect(await budgets.quickFillAllocations("2026-07", "2026-06")).toEqual(
      [],
    );
  });
});
