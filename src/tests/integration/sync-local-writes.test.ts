// SY-039: local writes are detected in one place, and engine writes are not.
import { createAccountService } from "@/services/accounts";
import { observeWrites } from "@/services/sync/write-observer";
import {
  createSyncHarness,
  type SyncHarness,
} from "@/tests/helpers/sync-harness";
import { afterEach, describe, expect, it, vi } from "vitest";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

const newAccount = {
  name: "Current",
  number: null,
  type: "bank" as const,
  balance: 0,
  currency: "GBP",
  notes: null,
  interestRate: null,
  creditLimit: null,
  pendingReconcileBalance: null,
  pendingReconcileDate: null,
};

describe("write observer", () => {
  it("fires for service writes, not reads, and never for sync cycles", async () => {
    harness = await createSyncHarness({ clients: 2 });
    const [a, b] = harness.clients;
    if (!a || !b) throw new Error("clients missing");
    const onWrite = vi.fn();
    const observed = observeWrites(a.database, onWrite);
    const accounts = createAccountService(observed);

    await accounts.getAll();
    expect(onWrite).not.toHaveBeenCalled();

    await accounts.create(newAccount);
    expect(onWrite).toHaveBeenCalled();
    onWrite.mockClear();

    // The engine works on the raw database: pushing, sealing, acking.
    await a.sync();
    expect(onWrite).not.toHaveBeenCalled();

    // Applying a remote change on A is an engine write too.
    await b.sync();
    await b.services.accounts.create({ ...newAccount, name: "Savings" });
    await b.sync();
    await a.sync();
    expect(onWrite).not.toHaveBeenCalled();
    expect((await accounts.getAll()).length).toBe(2);
  });

  it("fires once after a transaction commits, not when it only reads", async () => {
    harness = await createSyncHarness({ clients: 1 });
    const [a] = harness.clients;
    if (!a) throw new Error("client missing");
    const onWrite = vi.fn();
    const observed = observeWrites(a.database, onWrite);

    await observed.transaction(async (tx) => {
      await tx.query({ sql: "SELECT 1" });
    });
    expect(onWrite).not.toHaveBeenCalled();

    await observed.transaction(async (tx) => {
      await tx.execute({
        sql: "INSERT INTO payees (name) VALUES ('Shop')",
      });
      await tx.execute({
        sql: "INSERT INTO payees (name) VALUES ('Cafe')",
      });
    });
    expect(onWrite).toHaveBeenCalledTimes(1);

    await expect(
      observed.transaction(async (tx) => {
        await tx.execute({ sql: "INSERT INTO payees (name) VALUES ('X')" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(onWrite).toHaveBeenCalledTimes(1);
  });
});
