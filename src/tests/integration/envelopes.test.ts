import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import { ENVELOPE_GROCERIES, ENVELOPE_BILLS } from "./helpers/fixtures";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

describe("envelopes IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  // ── Envelope CRUD ──────────────────────────────────────────────────────────

  let groceriesId: number;
  let billsId: number;

  it("create envelope", async () => {
    const rows = await invoke<{ id: number; name: string; active: boolean }[]>(
      "envelopes:create",
      ENVELOPE_GROCERIES,
    );
    groceriesId = rows[0].id;
    expect(rows[0].name).toBe("Groceries");
    expect(rows[0].active).toBe(true);
  });

  it("create second envelope", async () => {
    const rows = await invoke<{ id: number }[]>(
      "envelopes:create",
      ENVELOPE_BILLS,
    );
    billsId = rows[0].id;
  });

  it("getAll returns only active envelopes", async () => {
    const all = await invoke<{ id: number }[]>("envelopes:getAll");
    expect(all.length).toBe(2);
  });

  it("getById returns single envelope", async () => {
    const found = await invoke<{ name: string } | null>(
      "envelopes:getById",
      groceriesId,
    );
    expect(found?.name).toBe("Groceries");
  });

  it("update envelope name", async () => {
    await invoke("envelopes:update", groceriesId, { name: "Food" });
    const found = await invoke<{ name: string } | null>(
      "envelopes:getById",
      groceriesId,
    );
    expect(found?.name).toBe("Food");
  });

  it("soft-delete envelope — getAll excludes it", async () => {
    await invoke("envelopes:delete", billsId);
    const all = await invoke<{ id: number }[]>("envelopes:getAll");
    expect(all.length).toBe(1);
    const found = await invoke<{ active: boolean } | null>(
      "envelopes:getById",
      billsId,
    );
    expect(found?.active).toBe(false);
  });

  // ── Envelope-category mappings ─────────────────────────────────────────────

  let mappingId: number;

  it("map expense category to envelope", async () => {
    const cats =
      await invoke<{ id: number; name: string; expenseType: string }[]>(
        "categories:getAll",
      );
    const groceriesCat = cats.find((c) => c.name === "Groceries");
    expect(groceriesCat).toBeDefined();

    const rows = await invoke<{ id: number }[]>("envelope_categories:create", {
      envelopeId: groceriesId,
      categoryId: groceriesCat!.id,
    });
    mappingId = rows[0].id;
    expect(rows.length).toBe(1);
  });

  it("reject mapping same category to two envelopes (UNIQUE constraint)", async () => {
    const cats =
      await invoke<{ id: number; name: string }[]>("categories:getAll");
    const groceriesCat = cats.find((c) => c.name === "Groceries")!;

    const billsRows = await invoke<{ id: number }[]>("envelopes:create", {
      name: "Bills2",
    });
    const bills2Id = billsRows[0].id;

    await expect(
      invoke("envelope_categories:create", {
        envelopeId: bills2Id,
        categoryId: groceriesCat.id,
      }),
    ).rejects.toThrow();
  });

  it("reject mapping transfer category to envelope", async () => {
    const cats =
      await invoke<{ id: number; name: string; expenseType: string }[]>(
        "categories:getAll",
      );
    let transferCat = cats.find((c) => c.expenseType === "transfer");
    if (!transferCat) {
      const rows = await invoke<{ id: number; expenseType: string }[]>(
        "categories:create",
        { name: "Test Transfer", expenseType: "transfer" },
      );
      transferCat = { ...rows[0], name: "Test Transfer" };
    }

    await expect(
      invoke("envelope_categories:create", {
        envelopeId: groceriesId,
        categoryId: transferCat.id,
      }),
    ).rejects.toThrow("Only expense-type categories");
  });

  it("reject mapping income category to envelope", async () => {
    const cats =
      await invoke<{ id: number; name: string; expenseType: string }[]>(
        "categories:getAll",
      );
    const salary = cats.find((c) => c.name === "Salary");
    expect(salary).toBeDefined();

    await expect(
      invoke("envelope_categories:create", {
        envelopeId: groceriesId,
        categoryId: salary!.id,
      }),
    ).rejects.toThrow("Only expense-type categories");
  });

  it("getByEnvelope returns mappings", async () => {
    const rows = await invoke<{ id: number }[]>(
      "envelope_categories:getByEnvelope",
      groceriesId,
    );
    expect(rows.length).toBe(1);
  });

  it("delete mapping", async () => {
    await invoke("envelope_categories:delete", mappingId);
    const rows = await invoke<{ id: number }[]>(
      "envelope_categories:getByEnvelope",
      groceriesId,
    );
    expect(rows.length).toBe(0);
  });
});
