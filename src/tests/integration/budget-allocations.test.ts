import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

describe("budget allocations IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  let envelopeA: number;
  let envelopeB: number;

  it("setup: create two envelopes", async () => {
    const a = await invoke<{ id: number }[]>("envelopes:create", {
      name: "Food",
    });
    const b = await invoke<{ id: number }[]>("envelopes:create", {
      name: "Bills",
    });
    envelopeA = a[0].id;
    envelopeB = b[0].id;
  });

  // ── Upsert ─────────────────────────────────────────────────────────────────

  it("upsert creates allocation when none exists", async () => {
    const rows = await invoke<{ id: number; assigned: number }[]>(
      "budget_allocations:upsert",
      envelopeA,
      "2026-03",
      300,
    );
    expect(rows[0].assigned).toBe(300);
  });

  it("upsert updates allocation when row exists", async () => {
    const rows = await invoke<{ assigned: number }[]>(
      "budget_allocations:upsert",
      envelopeA,
      "2026-03",
      350,
    );
    expect(rows[0].assigned).toBe(350);
  });

  it("getByMonth returns allocations for the month", async () => {
    await invoke("budget_allocations:upsert", envelopeB, "2026-03", 500);
    const rows = await invoke<{ envelopeId: number }[]>(
      "budget_allocations:getByMonth",
      "2026-03",
    );
    expect(rows.length).toBe(2);
  });

  // ── Quick Fill ─────────────────────────────────────────────────────────────

  it("quickFill copies from source month to target month", async () => {
    const rows = await invoke<{ envelopeId: number; assigned: number }[]>(
      "budget_allocations:quickFill",
      "2026-04",
      "2026-03",
    );
    expect(rows.length).toBe(2);
    const food = rows.find((r) => r.envelopeId === envelopeA);
    expect(food?.assigned).toBe(350);
  });

  it("quickFill does not overwrite existing allocations", async () => {
    await invoke("budget_allocations:upsert", envelopeA, "2026-05", 0);

    const rows = await invoke<{ envelopeId: number }[]>(
      "budget_allocations:quickFill",
      "2026-05",
      "2026-03",
    );
    expect(rows.length).toBe(1);
    expect(rows[0].envelopeId).toBe(envelopeB);

    const may = await invoke<{ envelopeId: number; assigned: number }[]>(
      "budget_allocations:getByMonth",
      "2026-05",
    );
    const foodMay = may.find((r) => r.envelopeId === envelopeA);
    expect(foodMay?.assigned).toBe(0);
  });

  it("quickFill skips inactive envelopes", async () => {
    await invoke("envelopes:delete", envelopeB);

    const rows = await invoke<{ envelopeId: number }[]>(
      "budget_allocations:quickFill",
      "2026-06",
      "2026-03",
    );
    expect(rows.length).toBe(1);
    expect(rows[0].envelopeId).toBe(envelopeA);
  });

  it("quickFill returns empty when source month has no allocations", async () => {
    const rows = await invoke<unknown[]>(
      "budget_allocations:quickFill",
      "2026-07",
      "2026-12",
    );
    expect(rows.length).toBe(0);
  });
});
