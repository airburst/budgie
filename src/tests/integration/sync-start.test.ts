// SY-031: Start sync on the first app (SPEC.md 11.1), on the multi-client
// harness with the real in-process server.
import { PORTABLE_TABLES } from "@/services/portable-data";
import {
  InvalidOutgoingEnvelopeError,
  SyncNotStartedError,
} from "@/services/sync/errors";
import { UUID_PATTERN } from "@/services/sync/payload";
import {
  prepareStart,
  startSync,
  StartRefusedError,
} from "@/services/sync/start";
import { syncNow } from "@/services/sync/status";
import {
  createSyncHarness,
  type SyncHarness,
  type SyncHarnessClient,
} from "@/tests/helpers/sync-harness";
import { writeTombstone } from "@/services/tombstone-store";
import { afterEach, describe, expect, it } from "vitest";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

const fresh = async (clients = 1) => {
  harness = await createSyncHarness({ clients, fresh: true });
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
  return row.id;
};

/** An engine write (no trigger side effects), as an old database would hold. */
const raw = (
  client: SyncHarnessClient,
  sql: string,
  params: Array<string | number | null> = [],
) =>
  client.database.execute({
    sql: sql.replace(/ WHERE /, ", sync_rev = sync_rev + 1 WHERE "),
    params,
  });

const one = async <T,>(
  client: SyncHarnessClient,
  sql: string,
  params: Array<string | number | null> = [],
) => {
  const [row] = await client.database.query({ sql, params });
  if (!row) throw new Error(`no row: ${sql}`);
  return row as T;
};

/** A database as an old app left it: legacy and 32-hex ids, a transfer, deletes. */
const seedLegacyData = async (client: SyncHarnessClient) => {
  const current = await newAccount(client, "Current");
  const savings = await newAccount(client, "Savings");
  const { id: transferCategory } = await one<{ id: number }>(
    client,
    "SELECT id FROM categories WHERE name = 'Savings' AND expense_type = 'transfer'",
  );
  const [leg] = await client.services.transactions.create({
    accountId: current,
    categoryId: transferCategory,
    date: "2026-11-20",
    payee: "To savings",
    amount: -50,
    notes: null,
    cleared: false,
  });
  if (!leg?.transferTransactionId) throw new Error("transfer not created");
  const [plain] = await client.services.transactions.create({
    accountId: current,
    categoryId: null,
    date: "2026-11-19",
    payee: "Tesco",
    amount: -12.5,
    notes: null,
    cleared: false,
  });
  if (!plain) throw new Error("transaction not created");
  await client.services.transactions.delete(plain.id);
  const { id: categoryId } = await one<{ id: number }>(
    client,
    "SELECT id FROM categories WHERE public_id LIKE 'legacy:%' AND expense_type = 'expense' ORDER BY id LIMIT 1",
  );
  await client.services.categories.delete(categoryId);

  // Ids as 0013 left them.
  await raw(client, "UPDATE accounts SET public_id = 'legacy:accounts:' || id WHERE id = ?", [current]);
  await raw(client, "UPDATE accounts SET public_id = lower(hex(randomblob(16))) WHERE id = ?", [savings]);
  await raw(client, "UPDATE transactions SET public_id = 'legacy:transactions:' || id WHERE id = ?", [leg.id]);
  await raw(client, "UPDATE transactions SET public_id = upper(hex(randomblob(16))) WHERE id = ?", [leg.transferTransactionId]);
  await raw(client, "UPDATE transactions SET public_id = upper('9b2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50') WHERE id = ?", [plain.id]);
  return { current, savings, leg: leg.id, counterLeg: leg.transferTransactionId, deleted: plain.id, categoryId };
};

const allRows = async (client: SyncHarnessClient) => {
  const rows: Array<{ tbl: string; id: number; public_id: string; sync_dirty: number; sync_unsealed: number }> = [];
  for (const table of PORTABLE_TABLES) {
    const found = await client.database.query<{ id: number; public_id: string; sync_dirty: number; sync_unsealed: number }>({
      sql: `SELECT id, public_id, sync_dirty, sync_unsealed FROM ${table}`,
    });
    rows.push(...found.map((row) => ({ tbl: table, ...row })));
  }
  return rows;
};

const serverRows = (h: SyncHarness) =>
  h.server.db
    .prepare("SELECT tbl, public_id, deleted, payload FROM changes ORDER BY tbl, public_id")
    .all() as Array<{ tbl: string; public_id: string; deleted: number; payload: string }>;

const stateOf = (client: SyncHarnessClient) =>
  one<{ cursor: string | null; enabled: number; last_error: string | null }>(
    client,
    "SELECT cursor, enabled, last_error FROM sync_state WHERE id = 1",
  );

describe("Start: local preparation", () => {
  it("rewrites every non-UUID id in one go, keeping foreign keys and transfer links, and marks every row dirty", async () => {
    const { clients } = await fresh();
    const a = clients[0] as SyncHarnessClient;
    const seeded = await seedLegacyData(a);
    const before = await allRows(a);
    const nonUuid = before.filter((row) => !UUID_PATTERN.test(row.public_id));
    // Seeded categories, plus the five rows above.
    expect(nonUuid.length).toBeGreaterThan(5);

    const prepared = await prepareStart(a.database, { now: () => a.clock.now });
    expect(Object.values(prepared.rewrittenIds).reduce((s, n) => s + n, 0)).toBe(nonUuid.length);
    expect(prepared.markedRows).toBe(before.length);

    const after = await allRows(a);
    expect(after).toHaveLength(before.length);
    for (const row of after) {
      expect(row.public_id).toMatch(UUID_PATTERN);
      expect(row).toMatchObject({ sync_dirty: 1, sync_unsealed: 1 });
    }
    // Canonical ids are kept; the others are new and distinct.
    const byKey = new Map(before.map((row) => [`${row.tbl}/${row.id}`, row.public_id]));
    for (const row of after) {
      const old = byKey.get(`${row.tbl}/${row.id}`) as string;
      if (UUID_PATTERN.test(old)) expect(row.public_id).toBe(old);
      else expect(row.public_id).not.toBe(old.toLowerCase());
    }
    expect(new Set(after.map((row) => `${row.tbl}/${row.public_id}`)).size).toBe(after.length);

    // Integer foreign keys untouched; the transfer still links both legs.
    const leg = await one<{ account_id: number; transfer_transaction_id: number }>(
      a, "SELECT account_id, transfer_transaction_id FROM transactions WHERE id = ?", [seeded.leg]);
    expect(leg).toEqual({ account_id: seeded.current, transfer_transaction_id: seeded.counterLeg });
    const legRow = await a.row("transactions", await a.publicIdOf("transactions", seeded.leg));
    const counterRow = await a.row("transactions", await a.publicIdOf("transactions", seeded.counterLeg));
    expect(legRow?.payload.transferTransactionPublicId).toBe(counterRow?.publicId);
    expect(counterRow?.payload.transferTransactionPublicId).toBe(legRow?.publicId);
    expect(legRow?.payload.accountPublicId).toBe(await a.publicIdOf("accounts", seeded.current));

    expect(await stateOf(a)).toMatchObject({ cursor: "0", enabled: 1 });
  });

  it("normalises legacy timestamps, dates and months to the contract formats", async () => {
    const { clients } = await fresh();
    const a = clients[0] as SyncHarnessClient;
    const account = await newAccount(a, "Current");
    const [tx] = await a.services.transactions.create({
      accountId: account, categoryId: null, date: "2026-11-20", payee: "Tesco",
      amount: -1, notes: null, cleared: false,
    });
    const [envelope] = await a.services.envelopes.create({ name: "Food", active: true, sortOrder: 0 });
    if (!tx || !envelope) throw new Error("not created");
    await a.services.budgets.upsertAllocation(envelope.id, "2026-11", 100);
    await raw(a, "UPDATE transactions SET date = '2026-11-20T00:00:00.000Z', created_at = '2026-11-20T09:12:44.123Z', updated_at = '2026-11-20T10:12:44+01:00' WHERE id = ?", [tx.id]);
    await raw(a, "UPDATE accounts SET deleted = 1, deleted_at = NULL, updated_at = '2026-11-21T08:00:00Z' WHERE id = ?", [account]);
    await raw(a, "UPDATE budget_allocations SET month = '2026-11-01', updated_at = '2999-01-01 00:00:00' WHERE envelope_id = ?", [envelope.id]);

    await prepareStart(a.database, { now: () => a.clock.now });

    expect(await one(a, "SELECT date, created_at, updated_at FROM transactions WHERE id = ?", [tx.id])).toEqual({
      date: "2026-11-20", created_at: "2026-11-20 09:12:44", updated_at: "2026-11-20 09:12:44",
    });
    expect(await one(a, "SELECT deleted, deleted_at FROM accounts WHERE id = ?", [account])).toEqual({
      deleted: 1, deleted_at: "2026-11-21 08:00:00",
    });
    const allocation = await one<{ month: string; updated_at: string }>(a, "SELECT month, updated_at FROM budget_allocations WHERE envelope_id = ?", [envelope.id]);
    expect(allocation.month).toBe("2026-11");
    expect(allocation.updated_at <= new Date(a.clock.now).toISOString().replace("T", " ").slice(0, 19)).toBe(true);
  });

  it("refuses, changing nothing, when a row cannot be sent even after normalisation", async () => {
    const { clients } = await fresh();
    const a = clients[0] as SyncHarnessClient;
    const account = await newAccount(a, "Current");
    const [tx] = await a.services.transactions.create({
      accountId: account, categoryId: null, date: "someday", payee: "Tesco",
      amount: -1, notes: null, cleared: false,
    });
    const before = await allRows(a);
    const error = await prepareStart(a.database, { now: () => a.clock.now }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidOutgoingEnvelopeError);
    expect(error).toMatchObject({ table: "transactions", problem: "payload field date has an invalid value" });
    expect((error as InvalidOutgoingEnvelopeError).publicId).toMatch(UUID_PATTERN);
    expect(await allRows(a)).toEqual(before);
    expect(await stateOf(a)).toMatchObject({ cursor: null, enabled: 0 });
    expect(tx).toBeDefined();
  });
});

describe("Start: rows held in the tombstone store", () => {
  it("gives stored rows canonical ids, follows rewritten references and marks them to send", async () => {
    const { clients } = await fresh();
    const a = clients[0] as SyncHarnessClient;
    const category = await one<{ id: number }>(a, "SELECT id FROM categories LIMIT 1");
    await raw(a, "UPDATE categories SET public_id = 'legacy:cat' WHERE id = ?", [category.id]);
    await a.database.transaction((transaction) =>
      writeTombstone(transaction, {
        tbl: "payees",
        publicId: "legacy:payee",
        hlc: null,
        dirty: false,
        unsealed: false,
        payload: {
          publicId: "legacy:payee", createdAt: "2026-01-01 00:00:00",
          updatedAt: "2026-01-01 00:00:00", deletedAt: "2026-01-02 00:00:00",
          name: "Tesco", categoryPublicId: "legacy:cat", amount: null,
        },
      }),
    );

    await prepareStart(a.database, { now: () => a.clock.now });

    const renamed = await one<{ public_id: string }>(a, "SELECT public_id FROM categories WHERE id = ?", [category.id]);
    const stored = await one<{ public_id: string; dirty: number; unsealed: number; payload: string }>(
      a, "SELECT * FROM sync_tombstones",
    );
    expect(stored.public_id).toMatch(UUID_PATTERN);
    expect(stored).toMatchObject({ dirty: 1, unsealed: 1 });
    expect(JSON.parse(stored.payload)).toMatchObject({
      publicId: stored.public_id,
      categoryPublicId: renamed.public_id,
    });
  });
});

describe("Start: first upload", () => {
  it("uploads every row, deleted ones included, with no non-UUID id on the server", async () => {
    const h = await fresh();
    const a = h.clients[0] as SyncHarnessClient;
    await seedLegacyData(a);
    const result = await startSync(a.database, a.deps(), { hasData: false });
    expect(result.status).toMatchObject({ state: "synced", pendingCount: 0, lastError: null });
    expect(result.status.lastSyncedAt).not.toBeNull();

    const local = await allRows(a);
    const server = serverRows(h);
    expect(server).toHaveLength(local.length);
    expect(server.map((row) => `${row.tbl}/${row.public_id}`).sort()).toEqual(
      local.map((row) => `${row.tbl}/${row.public_id}`).sort(),
    );
    for (const row of server) {
      expect(row.public_id).toMatch(UUID_PATTERN);
      const payload = JSON.parse(row.payload) as Record<string, unknown>;
      for (const [field, value] of Object.entries(payload)) {
        if (field.endsWith("PublicId") && value !== null) expect(value).toMatch(UUID_PATTERN);
      }
    }
    expect(server.filter((row) => row.deleted === 1).length).toBeGreaterThanOrEqual(2);
    expect(local.every((row) => row.sync_dirty === 0)).toBe(true);
  });

  it("uploads a database larger than one push chunk", async () => {
    const h = await fresh();
    const a = h.clients[0] as SyncHarnessClient;
    const account = await newAccount(a, "Current");
    for (let i = 0; i < 600; i++) {
      await a.database.execute({
        sql: "INSERT INTO transactions (account_id, date, payee, amount, cleared, reconciled) VALUES (?, '2026-11-01', ?, -1, 0, 0)",
        params: [account, `Payee ${i}`],
      });
    }
    await startSync(a.database, a.deps(), { hasData: false });
    expect(a.requests.filter((r) => r.push.length > 0).length).toBeGreaterThanOrEqual(2);
    expect(serverRows(h)).toHaveLength((await allRows(a)).length);
    expect((await allRows(a)).every((row) => row.sync_dirty === 0)).toBe(true);
  });

  it.each(["before-server", "after-server"] as const)(
    "resumes an upload interrupted %s and completes it",
    async (stage) => {
      const h = await fresh();
      const a = h.clients[0] as SyncHarnessClient;
      await seedLegacyData(a);
      const deps = a.deps({ maxEnvelopesPerRequest: 10 });
      a.failRequest(stage, { skip: 2 });
      const { status } = await startSync(a.database, deps, { hasData: false });
      expect(status).toMatchObject({ state: "offline", enabled: true, lastSyncedAt: null });
      expect(status.pendingCount).toBe((await allRows(a)).length);
      const stored = serverRows(h).length;
      expect(stored).toBeGreaterThan(0);
      expect(stored).toBeLessThan((await allRows(a)).length);
      expect(await a.cursor()).toBe("0");

      // Any later cycle finishes the job; ids are not rewritten again.
      const ids = (await allRows(a)).map((row) => row.public_id);
      expect(await syncNow(a.database, deps)).toMatchObject({ state: "synced", pendingCount: 0 });
      const local = await allRows(a);
      expect(local.map((row) => row.public_id)).toEqual(ids);
      expect(serverRows(h)).toHaveLength(local.length);
      expect(local.every((row) => row.sync_dirty === 0)).toBe(true);
    },
  );
});

describe("Start: refusal and ordering", () => {
  it("refuses when enrol reported data, pointing to Join, and changes nothing", async () => {
    const { clients } = await fresh();
    const a = clients[0] as SyncHarnessClient;
    const before = await allRows(a);
    const error = await startSync(a.database, a.deps(), { hasData: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StartRefusedError);
    expect((error as Error).message).toMatch(/Join/);
    expect(a.requests).toHaveLength(0);
    expect(await allRows(a)).toEqual(before);
  });

  it("probes the server with cursor 0 when no enrol answer is given", async () => {
    const h = await fresh(2);
    const [a, b] = h.clients as [SyncHarnessClient, SyncHarnessClient];
    await newAccount(a, "Current");
    await startSync(a.database, a.deps());
    expect(a.requests[0]).toEqual({ formatVersion: 1, cursor: "0", push: [] });

    const before = await allRows(b);
    await expect(startSync(b.database, b.deps())).rejects.toBeInstanceOf(StartRefusedError);
    expect(b.requests).toHaveLength(1);
    expect(await allRows(b)).toEqual(before);
    expect(await stateOf(b)).toMatchObject({ cursor: null, enabled: 0 });
  });

  it("never runs a cycle before Start: an edited seed category is not pushed with its legacy id", async () => {
    const h = await fresh();
    const a = h.clients[0] as SyncHarnessClient;
    const { id } = await one<{ id: number }>(a, "SELECT id FROM categories WHERE public_id LIKE 'legacy:%' ORDER BY id LIMIT 1");
    await a.services.categories.update(id, { name: "Groceries" });
    expect(await one(a, "SELECT sync_dirty FROM categories WHERE id = ?", [id])).toEqual({ sync_dirty: 1 });

    await expect(a.sync()).rejects.toBeInstanceOf(SyncNotStartedError);
    await expect(a.round()).rejects.toBeInstanceOf(SyncNotStartedError);
    expect(a.requests).toHaveLength(0);

    await startSync(a.database, a.deps(), { hasData: false });
    const pushed = a.requests.flatMap((r) => r.push);
    const category = pushed.find((e) => e.tbl === "categories" && e.payload.name === "Groceries");
    expect(category?.publicId).toMatch(UUID_PATTERN);
    expect(serverRows(h).every((row) => UUID_PATTERN.test(row.public_id))).toBe(true);
  });
});

describe("push guard", () => {
  it("fails the cycle naming the row instead of pushing an envelope receivers would refuse", async () => {
    const h = await fresh();
    const a = h.clients[0] as SyncHarnessClient;
    const account = await newAccount(a, "Current");
    await startSync(a.database, a.deps(), { hasData: false });
    const sent = a.requests.length;

    await a.database.execute({
      sql: "UPDATE accounts SET created_at = '2026-11-20T09:00:00Z' WHERE id = ?",
      params: [account],
    });
    const error = await a.sync().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidOutgoingEnvelopeError);
    expect(error).toMatchObject({
      table: "accounts",
      publicId: await a.publicIdOf("accounts", account),
      problem: "payload field createdAt has an invalid value",
    });
    expect(a.requests).toHaveLength(sent);
    expect(await one(a, "SELECT sync_dirty FROM accounts WHERE id = ?", [account])).toEqual({ sync_dirty: 1 });
  });
});
