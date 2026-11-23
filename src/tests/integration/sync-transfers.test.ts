// SY-027: transfer pairs stay whole across a sync (SPEC.md 8.8), on the
// multi-client harness.
import {
  comparable,
  createSyncHarness,
  type SyncHarness,
  type SyncHarnessClient,
} from "@/tests/helpers/sync-harness";
import { afterEach, describe, expect, it, vi } from "vitest";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

const setup = async () => {
  harness = await createSyncHarness();
  return harness.clients as [SyncHarnessClient, SyncHarnessClient];
};

const newAccount = async (client: SyncHarnessClient, name: string) => {
  const [row] = await client.services.accounts.create({
    name,
    number: null,
    type: "bank",
    balance: 100,
    currency: "GBP",
    notes: null,
    interestRate: null,
    creditLimit: null,
    pendingReconcileBalance: null,
    pendingReconcileDate: null,
  });
  if (!row) throw new Error("account not created");
  return { id: row.id };
};

const newTransaction = async (
  client: SyncHarnessClient,
  accountId: number,
  payee: string,
) => {
  await client.services.transactions.create({
    accountId,
    categoryId: null,
    date: "2026-11-20",
    payee,
    amount: -1,
    notes: null,
    cleared: false,
  });
};

/** A transfer from `from` to the account named `toName`; returns both legs. */
const newTransfer = async (
  client: SyncHarnessClient,
  from: { id: number },
  toName: string,
) => {
  const [category] = await client.database.query<{ id: number }>({
    sql: "SELECT id FROM categories WHERE name = ? AND parent_id IS NOT NULL AND expense_type = 'transfer'",
    params: [toName],
  });
  if (!category) throw new Error(`no transfer category for ${toName}`);
  const [row] = await client.services.transactions.create({
    accountId: from.id,
    categoryId: category.id,
    date: "2026-11-20",
    payee: "Transfer",
    amount: -50,
    notes: null,
    cleared: false,
  });
  if (!row?.transferTransactionId) throw new Error("not a transfer");
  const counterId = row.transferTransactionId;
  return {
    a: {
      id: row.id,
      publicId: await client.publicIdOf("transactions", row.id),
    },
    b: {
      id: counterId,
      publicId: await client.publicIdOf("transactions", counterId),
    },
  };
};

const twoAccounts = async (client: SyncHarnessClient) => {
  const current = await newAccount(client, "Current");
  await newAccount(client, "Savings");
  return current;
};

// Sequential: the capability database does not allow overlapping transactions.
const legs = async (client: SyncHarnessClient, ...ids: string[]) => {
  const rows = [];
  for (const id of ids) rows.push(await client.row("transactions", id));
  return rows;
};

const edit = (
  client: SyncHarnessClient,
  sql: string,
  params: Array<string | number | null>,
) => client.database.execute({ sql, params });

const timestamp = (offsetMs: number) =>
  new Date(vi.getRealSystemTime() + offsetMs)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

const expectConverged = async (...clients: SyncHarnessClient[]) => {
  const [first, ...rest] = await Promise.all(
    clients.map(async (client) => comparable(await client.snapshot())),
  );
  for (const other of rest) expect(other).toEqual(first);
  for (const client of clients) {
    const dirty = (await client.snapshot()).filter((row) => row.dirty);
    expect(dirty, `${client.name} has dirty rows`).toEqual([]);
  }
};

/** No live transaction is left linked to a deleted partner, or half-linked. */
const expectNoLoneLeg = async (client: SyncHarnessClient) => {
  const lone = await client.database.query({
    sql: `SELECT leg.id FROM transactions leg
      LEFT JOIN transactions partner ON partner.id = leg.transfer_transaction_id
      WHERE leg.deleted_at IS NULL AND leg.transfer_transaction_id IS NOT NULL
        AND (partner.id IS NULL OR partner.deleted_at IS NOT NULL
          OR partner.transfer_transaction_id IS NOT leg.id)`,
  });
  expect(lone, `${client.name} has a lone transfer leg`).toEqual([]);
};

describe("transfer pairs", () => {
  it("pushes both legs of a transfer in the same request", async () => {
    const [a] = await setup();
    const current = await twoAccounts(a);
    const transfer = await newTransfer(a, current, "Savings");
    await a.sync();
    const request = a.requests.find((r) =>
      r.push.some((e) => e.publicId === transfer.a.publicId),
    );
    expect(request?.push.map((e) => e.publicId)).toEqual(
      expect.arrayContaining([transfer.a.publicId, transfer.b.publicId]),
    );
  });

  it("never splits the legs across chunks, even at the 500 boundary", async () => {
    const [a, b] = await setup();
    const current = await twoAccounts(a);
    const [{ n }] = (await a.database.query<{ n: number }>({
      sql: `SELECT (SELECT COUNT(*) FROM accounts WHERE sync_dirty = 1)
        + (SELECT COUNT(*) FROM categories WHERE sync_dirty = 1) AS n`,
    })) as [{ n: number }];
    // Leave exactly one slot in the first chunk: the transfer's first leg
    // would be the 500th envelope if the legs were not kept together.
    const plain = 499 - n;
    for (let i = 0; i < plain; i++) await newTransaction(a, current.id, `P${i}`);
    const transfer = await newTransfer(a, current, "Savings");
    await a.sync();

    const sizes = a.requests.map((r) => r.push.length);
    expect(sizes.reduce((x, y) => x + y, 0)).toBe(n + plain + 2);
    expect(sizes.every((size) => size <= 500)).toBe(true);
    expect(sizes.length).toBeGreaterThan(1);
    const ids = [transfer.a.publicId, transfer.b.publicId];
    const holding = a.requests.filter((r) =>
      r.push.some((e) => ids.includes(e.publicId)),
    );
    expect(holding).toHaveLength(1);
    expect(
      holding[0]?.push.filter((e) => ids.includes(e.publicId)),
    ).toHaveLength(2);

    await b.sync();
    await expectConverged(a, b);
  });

  it("create, edit and delete on one device reach the other with both legs", async () => {
    const [a, b] = await setup();
    const current = await twoAccounts(a);
    const transfer = await newTransfer(a, current, "Savings");
    await a.sync();
    await b.sync();
    let [x, y] = await legs(b, transfer.a.publicId, transfer.b.publicId);
    expect(x?.payload.transferTransactionPublicId).toBe(transfer.b.publicId);
    expect(y?.payload.transferTransactionPublicId).toBe(transfer.a.publicId);
    await expectNoLoneLeg(b);

    await a.services.transactions.update(transfer.a.id, { amount: -75 });
    await a.sync();
    await b.sync();
    [x, y] = await legs(b, transfer.a.publicId, transfer.b.publicId);
    expect([x?.payload.amount, y?.payload.amount]).toEqual([-75, 75]);
    await expectConverged(a, b);

    await a.services.transactions.delete(transfer.a.id);
    await a.sync();
    await b.sync();
    [x, y] = await legs(b, transfer.a.publicId, transfer.b.publicId);
    expect(x?.payload.deletedAt).not.toBeNull();
    expect(y?.payload.deletedAt).not.toBeNull();
    await expectConverged(a, b);
  });

  const deleteVersusEdit = async (order: "delete-first" | "edit-first") => {
    const [a, b] = await setup();
    const current = await twoAccounts(a);
    const transfer = await newTransfer(a, current, "Savings");
    await a.sync();
    await b.sync();

    await a.services.transactions.delete(transfer.a.id);
    // B edits one leg later than A's delete, so the edit wins that row.
    await edit(
      b,
      "UPDATE transactions SET notes = ?, updated_at = ? WHERE public_id = ?",
      ["edited on B", timestamp(60_000), transfer.b.publicId],
    );
    if (order === "delete-first") {
      await a.sync();
      await b.sync();
    } else {
      await b.sync();
      await a.sync();
      await b.sync();
    }
    await a.sync();
    await b.sync();

    await expectConverged(a, b);
    const [x, y] = await legs(a, transfer.a.publicId, transfer.b.publicId);
    expect(x?.payload.deletedAt).not.toBeNull();
    expect(y?.payload.deletedAt).not.toBeNull();
    for (const client of [a, b]) {
      await expectNoLoneLeg(client);
      expect(await client.services.transactions.getAll()).toEqual([]);
    }
  };

  it("one device deletes while another edits one leg, delete synced first", () =>
    deleteVersusEdit("delete-first"));

  it("one device deletes while another edits one leg, edit synced first", () =>
    deleteVersusEdit("edit-first"));

  it("an edit older than the delete leaves both legs deleted", async () => {
    const [a, b] = await setup();
    const current = await twoAccounts(a);
    const transfer = await newTransfer(a, current, "Savings");
    await a.sync();
    await b.sync();
    await edit(
      b,
      "UPDATE transactions SET notes = ?, updated_at = ? WHERE public_id = ?",
      ["edited on B", timestamp(-60_000), transfer.b.publicId],
    );
    await a.services.transactions.delete(transfer.a.id);
    await a.sync();
    await b.sync();
    await a.sync();
    await expectConverged(a, b);
    const [x, y] = await legs(b, transfer.a.publicId, transfer.b.publicId);
    expect(x?.payload.deletedAt).not.toBeNull();
    expect(y?.payload.deletedAt).not.toBeNull();
  });
});
