import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

describe("budget transfers IPC", () => {
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

  it("create transfer between envelopes", async () => {
    const rows = await invoke<{ id: number; amount: number }[]>(
      "budget_transfers:create",
      {
        fromEnvelopeId: envelopeA,
        toEnvelopeId: envelopeB,
        month: "2026-03",
        amount: 50,
      },
    );
    expect(rows[0].amount).toBe(50);
  });

  it("getByMonth returns transfers for the month", async () => {
    const rows = await invoke<{ id: number }[]>(
      "budget_transfers:getByMonth",
      "2026-03",
    );
    expect(rows.length).toBe(1);
  });

  it("reject self-transfer (CHECK constraint)", async () => {
    await expect(
      invoke("budget_transfers:create", {
        fromEnvelopeId: envelopeA,
        toEnvelopeId: envelopeA,
        month: "2026-03",
        amount: 50,
      }),
    ).rejects.toThrow();
  });

  it("reject zero or negative amount (CHECK constraint)", async () => {
    await expect(
      invoke("budget_transfers:create", {
        fromEnvelopeId: envelopeA,
        toEnvelopeId: envelopeB,
        month: "2026-03",
        amount: 0,
      }),
    ).rejects.toThrow();

    await expect(
      invoke("budget_transfers:create", {
        fromEnvelopeId: envelopeA,
        toEnvelopeId: envelopeB,
        month: "2026-03",
        amount: -10,
      }),
    ).rejects.toThrow();
  });

  it("delete transfer", async () => {
    const all = await invoke<{ id: number }[]>(
      "budget_transfers:getByMonth",
      "2026-03",
    );
    await invoke("budget_transfers:delete", all[0].id);
    const after = await invoke<{ id: number }[]>(
      "budget_transfers:getByMonth",
      "2026-03",
    );
    expect(after.length).toBe(0);
  });
});
