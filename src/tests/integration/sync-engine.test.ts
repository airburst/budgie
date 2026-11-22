// SY-026: one sync cycle, end to end, between several real client databases
// and the in-process sync server (src/tests/helpers/sync-harness.ts).
import { MissingReferenceError } from "@/services/portable-data";
import { InvalidEnvelopeError } from "@/services/sync/errors";
import {
  comparable,
  createSyncHarness,
  HarnessNetworkError,
  type SyncHarness,
  type SyncHarnessClient,
} from "@/tests/helpers/sync-harness";
import { afterEach, describe, expect, it, vi } from "vitest";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

const setup = async (
  options: Parameters<typeof createSyncHarness>[0] = {},
) => {
  harness = await createSyncHarness(options);
  return harness;
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
  return { id: row.id, publicId: await client.publicIdOf("accounts", row.id) };
};

const newTransaction = async (
  client: SyncHarnessClient,
  accountId: number,
  payee: string,
  amount = -10,
  notes: string | null = null,
) => {
  const [row] = await client.services.transactions.create({
    accountId,
    categoryId: null,
    date: "2026-11-20",
    payee,
    amount,
    notes,
    cleared: false,
  });
  if (!row) throw new Error("transaction not created");
  return {
    id: row.id,
    publicId: await client.publicIdOf("transactions", row.id),
  };
};

/** A user edit with an explicit edit time (the triggers keep it). */
const editAt = (
  client: SyncHarnessClient,
  sql: string,
  params: Array<string | number | null>,
) => client.database.execute({ sql, params });

/** Local integer id of a row by public id. */
const localId = async (
  client: SyncHarnessClient,
  table: string,
  publicId: string,
) => {
  const [row] = await client.database.query<{ id: number }>({
    sql: `SELECT id FROM ${table} WHERE public_id = ?`,
    params: [publicId],
  });
  if (!row) throw new Error(`${table} ${publicId} not on ${client.name}`);
  return row.id;
};

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

/**
 * Real time plus `offsetMs` as a `timestamp`, for edits that must win or lose.
 * Real time, because the triggers' CURRENT_TIMESTAMP ignores the pinned clock.
 */
const timestamp = (offsetMs: number) =>
  new Date(vi.getRealSystemTime() + offsetMs)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

describe("sync harness", () => {
  it("runs several clients, each with its own device, against one server", async () => {
    const { clients, server } = await setup({ clients: 3 });
    expect(new Set(clients.map((c) => c.deviceId)).size).toBe(3);
    const [a, b, c] = clients as [
      SyncHarnessClient,
      SyncHarnessClient,
      SyncHarnessClient,
    ];
    a.clock.now = 1_000;
    expect(b.clock.now).not.toBe(1_000);
    const result = await a.sync();
    expect(result.rounds).toBe(1);
    await b.sync();
    await c.sync();
    expect(
      server.db.prepare("SELECT COUNT(*) AS n FROM devices").get(),
    ).toEqual({ n: 3 });
  });
});

describe("sync cycle", () => {
  it("pushes local rows, pulls them on another device and returns counts", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    await newTransaction(a, account.id, "Tesco");
    await newTransaction(a, account.id, "Aldi");

    const pushed = await a.sync();
    // The account, its transfer category and two transactions.
    expect(pushed.pushed).toMatchObject({
      accounts: 1,
      categories: 1,
      transactions: 2,
    });
    expect(Object.values(pushed.applied).every((n) => n === 0)).toBe(true);
    expect(pushed.cursor).not.toBe("0");
    expect(await a.cursor()).toBe(pushed.cursor);

    const pulled = await b.sync();
    expect(pulled.applied).toMatchObject({
      accounts: 1,
      categories: 1,
      transactions: 2,
      payees: 0,
    });
    expect(Object.values(pulled.pushed).every((n) => n === 0)).toBe(true);
    await expectConverged(a, b);

    // Applied rows are clean and keep the sender's updatedAt.
    const onA = await a.row("accounts", account.publicId);
    const onB = await b.row("accounts", account.publicId);
    expect(onB).toMatchObject({ dirty: false, unsealed: false });
    expect(onB?.payload.updatedAt).toBe(onA?.payload.updatedAt);
  });

  it("offline edits to different rows on two devices both arrive", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    await a.sync();
    await b.sync();

    await a.services.accounts.update(account.id, { notes: "edited on A" });
    const onB = await localId(b, "accounts", account.publicId);
    const spend = await newTransaction(b, onB, "Bakery");
    const other = await newAccount(b, "Cash");
    await b.sync();
    await a.sync();
    await b.sync();

    await expectConverged(a, b);
    expect(await b.row("accounts", account.publicId)).toMatchObject({
      payload: { notes: "edited on A" },
    });
    expect(await a.row("accounts", other.publicId)).toMatchObject({
      payload: { name: "Cash" },
    });
    expect(await a.row("transactions", spend.publicId)).toMatchObject({
      payload: { payee: "Bakery", accountPublicId: account.publicId },
    });
  });

  it("the same row edited on both devices: the higher hlc wins on both", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    await a.sync();
    await b.sync();

    // B's edit is later, but A syncs last.
    await editAt(
      b,
      "UPDATE accounts SET notes = ?, updated_at = ? WHERE public_id = ?",
      ["from B", timestamp(60_000), account.publicId],
    );
    await editAt(
      a,
      "UPDATE accounts SET notes = ?, updated_at = ? WHERE public_id = ?",
      ["from A", timestamp(1_000), account.publicId],
    );
    await b.sync();
    await a.sync();
    await b.sync();

    await expectConverged(a, b);
    const row = await a.row("accounts", account.publicId);
    expect(row?.payload.notes).toBe("from B");
    expect(row?.hlc?.endsWith(b.deviceId)).toBe(true);
  });

  it("the earlier edit pushed second is rejected stale and acknowledged", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    await a.sync();
    await b.sync();
    await editAt(
      b,
      "UPDATE accounts SET notes = ?, updated_at = ? WHERE public_id = ?",
      ["from B", timestamp(60_000), account.publicId],
    );
    await editAt(
      a,
      "UPDATE accounts SET notes = ?, updated_at = ? WHERE public_id = ?",
      ["from A", timestamp(1_000), account.publicId],
    );
    await b.sync();
    // A's push loses on the server; B's version arrives in the same round.
    const result = await a.round();
    expect(result.rejected).toEqual([
      { tbl: "accounts", publicId: account.publicId, reason: "stale" },
    ]);
    expect(await a.row("accounts", account.publicId)).toMatchObject({
      dirty: false,
      payload: { notes: "from B" },
    });
  });

  it("delete vs edit: the later delete wins over an earlier edit", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    const spend = await newTransaction(a, account.id, "Tesco");
    await a.sync();
    await b.sync();

    const deletedAt = timestamp(30_000);
    await editAt(
      a,
      "UPDATE transactions SET payee = ?, updated_at = ? WHERE public_id = ?",
      ["Tesco Extra", timestamp(1_000), spend.publicId],
    );
    await editAt(
      b,
      "UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE public_id = ?",
      [deletedAt, deletedAt, spend.publicId],
    );
    await a.sync();
    await b.sync();
    await a.sync();

    await expectConverged(a, b);
    expect(await a.row("transactions", spend.publicId)).toMatchObject({
      payload: { deletedAt, payee: "Tesco" },
    });
    expect(
      (await a.services.transactions.getAll()).map((t) => t.payee),
    ).not.toContain("Tesco");
  });

  it("delete vs edit: a later edit beats an earlier delete and revives the row", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    const spend = await newTransaction(a, account.id, "Tesco");
    await a.sync();
    await b.sync();

    await a.services.transactions.delete(spend.id);
    await editAt(
      b,
      "UPDATE transactions SET payee = ?, updated_at = ? WHERE public_id = ?",
      ["Tesco Extra", timestamp(60_000), spend.publicId],
    );
    await a.sync();
    await b.sync();
    await a.sync();

    await expectConverged(a, b);
    expect(await a.row("transactions", spend.publicId)).toMatchObject({
      payload: { deletedAt: null, payee: "Tesco Extra" },
    });
  });

  it("delete then revive: the undelete reaches every device", async () => {
    const { clients } = await setup({ clients: 3 });
    const [a, b, c] = clients as [
      SyncHarnessClient,
      SyncHarnessClient,
      SyncHarnessClient,
    ];
    const account = await newAccount(a, "Savings");
    await a.sync();
    await b.sync();
    await c.sync();

    await a.services.accounts.delete(account.id);
    await a.sync();
    await b.sync();
    expect(await b.row("accounts", account.publicId)).toMatchObject({
      payload: { deleted: true },
    });
    expect(
      (await b.row("accounts", account.publicId))?.payload.deletedAt,
    ).not.toBeNull();

    // B revives it (a user edit clearing both delete fields).
    await editAt(
      b,
      "UPDATE accounts SET deleted = 0, deleted_at = NULL, updated_at = ? WHERE public_id = ?",
      [timestamp(60_000), account.publicId],
    );
    await b.sync();
    await a.sync();
    await c.sync();

    await expectConverged(a, b, c);
    expect(await c.row("accounts", account.publicId)).toMatchObject({
      payload: { deleted: false, deletedAt: null },
    });
    expect(
      (await a.services.accounts.getAll()).map((row) => row.name),
    ).toContain("Savings");
  });

  it("a child row arriving a page before its parent is applied", async () => {
    // Page size 1: every pulled row is its own page.
    const { clients } = await setup({ pageSize: 1 });
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    const spend = await newTransaction(a, account.id, "Tesco");
    const [parent] = await a.services.categories.create({
      parentId: null,
      name: "Food",
      expenseType: "expense",
    });
    const [child] = await a.services.categories.create({
      parentId: parent?.id ?? null,
      name: "Groceries",
      expenseType: "expense",
    });
    await a.sync();
    // Rewriting the parents puts them after their children in server order.
    await a.services.accounts.update(account.id, { notes: "later" });
    await a.services.categories.update(parent?.id ?? 0, { name: "Food!" });
    await a.sync();

    const result = await b.sync();
    // Five rows, one per page: the transaction and the child category come
    // pages before the account and the parent.
    expect(result.requests).toBeGreaterThanOrEqual(5);
    expect(result.applied).toMatchObject({ accounts: 1, transactions: 1 });
    await expectConverged(a, b);
    const childOnB = await b.row(
      "categories",
      await a.publicIdOf("categories", child?.id ?? 0),
    );
    expect(childOnB?.payload.parentPublicId).toBe(
      await a.publicIdOf("categories", parent?.id ?? 0),
    );
    expect(await b.row("transactions", spend.publicId)).toMatchObject({
      payload: { accountPublicId: account.publicId },
    });
  });

  it("a row edited while its push is in flight stays dirty, then syncs next round", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    await a.sync();
    await b.sync();

    await a.services.accounts.update(account.id, { notes: "first" });
    a.beforeResponse(() =>
      a.services.accounts.update(account.id, { notes: "second" }).then(() => {}),
    );
    const round = await a.round();
    const pushedHlc = round.pushedEnvelopes[0]?.hlc;
    expect(round.pushedEnvelopes[0]?.payload.notes).toBe("first");
    expect(await a.row("accounts", account.publicId)).toMatchObject({
      hlc: pushedHlc,
      dirty: true,
      unsealed: true,
      payload: { notes: "second" },
    });

    await b.sync();
    expect(
      (await b.row("accounts", account.publicId))?.payload.notes,
    ).toBe("first");

    const cycle = await a.sync();
    expect(cycle.pushed.accounts).toBe(1);
    await b.sync();
    await expectConverged(a, b);
    expect(
      (await b.row("accounts", account.publicId))?.payload.notes,
    ).toBe("second");
  });

  it("a cycle runs another round for an edit made while its push was in flight", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    a.beforeResponse(() =>
      a.services.accounts.update(account.id, { notes: "during" }).then(() => {}),
    );
    const cycle = await a.sync();
    expect(cycle.rounds).toBe(2);
    expect(cycle.pushed.accounts).toBe(2);
    await b.sync();
    await expectConverged(a, b);
  });
});

describe("chunking and retries", () => {
  const seed = async (client: SyncHarnessClient, count: number) => {
    const account = await newAccount(client, "Current");
    for (let i = 0; i < count; i++) {
      await newTransaction(client, account.id, `Payee ${i}`, -i);
    }
    return account;
  };

  it("pushes more than 500 rows in chunks of at most 500, in apply order", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    await seed(a, 1100);
    const result = await a.sync();
    expect(result.pushed.transactions).toBe(1100);
    const sizes = a.requests.map((r) => r.push.length);
    expect(sizes).toEqual([500, 500, 102]);
    // Apply order: the account and its category go first.
    expect(a.requests[0]?.push.slice(0, 2).map((e) => e.tbl)).toEqual([
      "accounts",
      "categories",
    ]);

    const pulled = await b.sync();
    expect(pulled.applied.transactions).toBe(1100);
    await expectConverged(a, b);
  });

  it("splits a push that would exceed the 1 MiB body cap", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    const notes = "x".repeat(8_000);
    for (let i = 0; i < 200; i++) {
      await newTransaction(a, account.id, `Payee ${i}`, -i, notes);
    }
    await a.sync();
    expect(a.requests.length).toBeGreaterThan(1);
    for (const request of a.requests) {
      expect(
        new TextEncoder().encode(JSON.stringify(request)).length,
      ).toBeLessThanOrEqual(1_048_576);
    }
    await b.sync();
    await expectConverged(a, b);
  });

  for (const stage of ["before-server", "after-server"] as const) {
    it(`a push failing mid-way (${stage}) and retried leaves no duplicates and no lost rows`, async () => {
      const { clients, server } = await setup();
      const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
      await seed(a, 1100);
      a.failRequest(stage, { skip: 1 });

      await expect(a.sync()).rejects.toBeInstanceOf(HarnessNetworkError);
      expect(await a.cursor()).toBe("0");
      const dirty = (await a.rows("transactions")).filter((r) => r.dirty);
      expect(dirty).toHaveLength(1100);
      const storedAfterFailure = server.db
        .prepare("SELECT COUNT(*) AS n FROM changes")
        .get() as { n: number };
      expect(storedAfterFailure.n).toBe(stage === "after-server" ? 1000 : 500);

      const retry = await a.sync();
      expect(retry.pushed.transactions).toBe(1100);
      expect(retry.rejected.filter((r) => r.reason === "stale")).toHaveLength(
        storedAfterFailure.n,
      );
      expect(
        server.db.prepare("SELECT COUNT(*) AS n FROM changes").get(),
      ).toEqual({ n: 1102 });

      await b.sync();
      expect(await b.rows("transactions")).toHaveLength(1100);
      await expectConverged(a, b);
    });
  }

  it("a pull that fails after the server answered is fetched again", async () => {
    const { clients } = await setup({ pageSize: 10 });
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    await seed(a, 30);
    await a.sync();
    b.failRequest("after-server", { skip: 2 });
    await expect(b.sync()).rejects.toBeInstanceOf(HarnessNetworkError);
    expect(await b.cursor()).toBe("0");
    expect(await b.rows("transactions")).toHaveLength(0);
    const result = await b.sync();
    expect(result.applied.transactions).toBe(30);
    await expectConverged(a, b);
  });
});

describe("failed apply", () => {
  it("rolls back on a missing reference, keeps the cursor, and succeeds once the parent arrives", async () => {
    const { clients, server } = await setup({ clients: 3 });
    const [a, b, c] = clients as [
      SyncHarnessClient,
      SyncHarnessClient,
      SyncHarnessClient,
    ];
    await newAccount(a, "Current");
    await a.sync();
    await b.sync();
    const cursorBefore = await b.cursor();

    // C writes a valid account and a transaction whose account it has not
    // pushed (a parent in a later chunk, as SPEC 8.6 describes).
    const account = await newAccount(c, "Joint");
    const spend = await newTransaction(c, account.id, "Gym");
    await c.round();
    server.db
      .prepare("DELETE FROM changes WHERE tbl = 'accounts' AND public_id = ?")
      .run(account.publicId);

    const before = comparable(await b.snapshot());
    const error = await b.sync().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MissingReferenceError);
    expect(error).toMatchObject({
      code: "missing_reference",
      table: "transactions",
      publicId: spend.publicId,
      referencedPublicId: account.publicId,
    });
    expect(await b.cursor()).toBe(cursorBefore);
    expect(comparable(await b.snapshot())).toEqual(before);

    // C pushes the account again; B's next cycle applies everything.
    await c.database.execute({
      sql: "UPDATE accounts SET notes = 'again' WHERE public_id = ?",
      params: [account.publicId],
    });
    await c.sync();
    await b.sync();
    await a.sync();
    await expectConverged(a, b, c);
  });

  it("rolls back on an invalid envelope and keeps the cursor", async () => {
    const { clients, server } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const account = await newAccount(a, "Current");
    await a.sync();
    server.db
      .prepare(
        "UPDATE changes SET payload = json_set(payload, '$.type', 'piggy_bank') WHERE public_id = ?",
      )
      .run(account.publicId);

    const error = await b.sync().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidEnvelopeError);
    expect(error).toMatchObject({ code: "invalid_envelope" });
    expect(await b.cursor()).toBe("0");
    expect(await b.rows("accounts")).toEqual([]);
    expect(await b.rows("transactions")).toEqual([]);
  });
});
