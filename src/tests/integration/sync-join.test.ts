// SY-032: Join (SPEC.md 11.2) between real client databases and the
// in-process sync server. Enrolment is taken as done (the harness enrols
// every client); Start on the first device is simulated by marking every row
// dirty and unsealed, as SPEC.md 11.1 step 2 does.
import { PORTABLE_TABLES } from "@/services/portable-data";
import { MissingReferenceError } from "@/services/sync/errors";
import { joinSync } from "@/services/sync/join";
import { SYNC_FORMAT_VERSION } from "@/services/sync/payload";
import {
  comparable,
  createSyncHarness,
  HarnessNetworkError,
  type SyncHarness,
  type SyncHarnessClient,
} from "@/tests/helpers/sync-harness";
import { afterEach, describe, expect, it } from "vitest";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

const setup = async (options: Parameters<typeof createSyncHarness>[0] = {}) => {
  harness = await createSyncHarness(options);
  return harness;
};

/** Start on the first device: every row dirty and unsealed, then sync. */
const start = async (client: SyncHarnessClient) => {
  for (const table of PORTABLE_TABLES) {
    await client.database.execute({
      sql: `UPDATE ${table} SET sync_dirty = 1, sync_unsealed = 1, sync_rev = sync_rev + 1`,
    });
  }
  await client.sync();
};

const join = (client: SyncHarnessClient, overrides = {}) =>
  joinSync(client.database, client.deps(overrides));

const newAccount = async (
  client: SyncHarnessClient,
  name: string,
  publicId?: string,
) => {
  if (publicId) {
    await client.database.execute({
      sql: "INSERT INTO accounts (public_id, name, type, balance, currency) VALUES (?, ?, 'bank', 0, 'GBP')",
      params: [publicId, name],
    });
    const [row] = await client.database.query<{ id: number }>({
      sql: "SELECT id FROM accounts WHERE public_id = ?",
      params: [publicId],
    });
    return { id: row?.id ?? 0, publicId };
  }
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
) => {
  const [row] = await client.services.transactions.create({
    accountId,
    categoryId: null,
    date: "2026-11-20",
    payee,
    amount: -10,
    notes: null,
    cleared: false,
  });
  if (!row) throw new Error("transaction not created");
};

/** Budget rows for one envelope: a category link and a monthly allocation. */
const budgetFor = async (
  client: SyncHarnessClient,
  envelopeId: number,
  assigned: number,
) => {
  await client.services.envelopes.createCategory({ envelopeId, categoryId: 1 });
  await client.services.budgets.upsertAllocation(envelopeId, "2026-12", assigned);
};

const settings = async (client: SyncHarnessClient) => {
  const [row] = await client.database.query<{ preferences: string }>({
    sql: "SELECT preferences FROM settings WHERE id = 1",
  });
  return row ? (JSON.parse(row.preferences) as Record<string, unknown>) : null;
};

const setSettings = (client: SyncHarnessClient, value: object) =>
  client.database.execute({
    sql: `INSERT INTO settings (id, preferences) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET preferences = excluded.preferences`,
    params: [JSON.stringify(value)],
  });

/** Everything that a join must leave untouched when it fails. */
const localState = async (client: SyncHarnessClient) => ({
  rows: await client.snapshot(),
  settings: await settings(client),
  cursor: await client.cursor(),
});

/** A first device with data in every kind of table, started. */
const firstDevice = async (a: SyncHarnessClient) => {
  const account = await newAccount(a, "Current");
  await newTransaction(a, account.id, "Tesco");
  await newTransaction(a, account.id, "Aldi");
  await a.services.payees.create({ name: "Tesco", categoryId: 1, amount: 12 });
  const [envelope] = await a.services.envelopes.create({
    name: "Food",
    active: true,
    sortOrder: 0,
  });
  if (!envelope) throw new Error("envelope not created");
  await budgetFor(a, envelope.id, 250);
  await start(a);
  return {
    account,
    envelopePublicId: await a.publicIdOf("envelopes", envelope.id),
  };
};

describe("join (SY-032)", () => {
  it("replaces the joining device's data with the synced books, pushing nothing", async () => {
    const { clients, server } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const { envelopePublicId } = await firstDevice(a);

    // B's old data overlaps A's natural keys: the same payee name, a link
    // for the same category, and (an envelope restored from an old backup
    // of A, so the same public id) an allocation for the same month.
    const old = await newAccount(b, "Old account");
    await newTransaction(b, old.id, "Old shop");
    await b.services.payees.create({ name: "Tesco", categoryId: null, amount: 1 });
    await b.database.execute({
      sql: "INSERT INTO envelopes (public_id, name) VALUES (?, 'Food (old)')",
      params: [envelopePublicId],
    });
    const [oldEnvelope] = await b.database.query<{ id: number }>({
      sql: "SELECT id FROM envelopes WHERE public_id = ?",
      params: [envelopePublicId],
    });
    await budgetFor(b, oldEnvelope?.id ?? 0, 99);
    const oldIds = new Set(
      (await b.snapshot())
        .filter((row) => !(row.publicId.startsWith("00000000-")))
        .map((row) => `${row.tbl}/${row.publicId}`),
    );
    oldIds.delete(`envelopes/${envelopePublicId}`);

    const result = await join(b);
    expect(result.cursor).not.toBe("0");
    expect(await b.cursor()).toBe(result.cursor);
    expect(result.applied).toMatchObject({
      accounts: 1,
      transactions: 2,
      payees: 1,
      envelopes: 1,
      envelope_categories: 1,
      budget_allocations: 1,
    });

    // Every row of the first device, identical on the joining device.
    const onA = comparable(await a.snapshot());
    const onB = comparable(await b.snapshot());
    const key = (row: { tbl: string; publicId: string }) =>
      `${row.tbl}/${row.publicId}`;
    const fromA = new Set(onA.map(key));
    expect(onB.filter((row) => fromA.has(key(row)))).toEqual(onA);
    // The rest is exactly B's old data: deleted, clean, without an HLC.
    const rest = (await b.snapshot()).filter((row) => !fromA.has(key(row)));
    expect(new Set(rest.map(key))).toEqual(oldIds);
    for (const row of rest) {
      expect(row).toMatchObject({ hlc: null, dirty: false, unsealed: false });
      expect(row.payload.deletedAt).not.toBeNull();
    }
    // The services see A's books only.
    expect((await b.services.accounts.getAll()).map((x) => x.name)).toEqual([
      "Current",
    ]);
    expect(await b.services.payees.getAll()).toEqual([
      expect.objectContaining({ name: "Tesco", amount: 12 }),
    ]);
    expect(
      await b.services.budgets.getAllocationsByMonth("2026-12"),
    ).toEqual([expect.objectContaining({ assigned: 250 })]);

    // Nothing was pushed, then or on the next cycle.
    expect(b.requests.every((request) => request.push.length === 0)).toBe(true);
    const next = await b.sync();
    expect(Object.values(next.pushed).every((n) => n === 0)).toBe(true);
    expect(
      server.db
        .prepare("SELECT count(*) AS n FROM changes WHERE device_id = ?")
        .get(b.deviceId),
    ).toEqual({ n: 0 });
    expect(comparable(await a.snapshot())).toEqual(onA);
  });

  it("pulls every page from cursor 0", async () => {
    const { clients } = await setup({ pageSize: 3 });
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    await firstDevice(a);
    const result = await join(b);
    expect(result.requests).toBeGreaterThan(3);
    expect(b.requests[0]?.cursor).toBe("0");
    expect(
      comparable(await b.snapshot()).filter((row) => row.hlc !== null),
    ).toEqual(comparable(await a.snapshot()));
  });

  it("remaps account shortcuts by public id, drops the rest and keeps other preferences", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    const { account } = await firstDevice(a);
    // B knows A's account (same public id) and one of its own.
    const shared = await newAccount(b, "Current (old)", account.publicId);
    const own = await newAccount(b, "Own");
    await setSettings(b, {
      theme: "dark",
      hideReconciled: true,
      accountShortcuts: [
        { key: "1", accountId: shared.id },
        { key: "2", ctrl: true, accountId: own.id },
      ],
    });

    await join(b);

    expect(await settings(b)).toEqual({
      theme: "dark",
      hideReconciled: true,
      accountShortcuts: [{ key: "1", accountId: shared.id }],
    });
    expect(await b.services.accounts.getById(shared.id)).toMatchObject({
      name: "Current",
    });
  });

  it("leaves the data as it was when the pull fails", async () => {
    const { clients } = await setup({ pageSize: 3 });
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    await firstDevice(a);
    await b.services.payees.create({ name: "Mine", categoryId: null, amount: 1 });
    await setSettings(b, { theme: "light" });
    const before = await localState(b);

    b.failRequest("after-server", { skip: 1 });
    await expect(join(b)).rejects.toBeInstanceOf(HarnessNetworkError);
    expect(await localState(b)).toEqual(before);
  });

  it("leaves the data as it was when the apply fails", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    await firstDevice(a);
    const old = await newAccount(b, "Old");
    await setSettings(b, {
      theme: "light",
      accountShortcuts: [{ key: "1", accountId: old.id }],
    });
    await b.services.payees.create({ name: "Tesco", categoryId: null, amount: 1 });
    const before = await localState(b);

    // A failing after-apply hook runs after the old rows were marked and the
    // pull applied: everything is rolled back.
    await expect(
      join(b, {
        afterApply: [
          async () => {
            throw new Error("hook failed");
          },
        ],
      }),
    ).rejects.toThrow("hook failed");
    expect(await localState(b)).toEqual(before);

    // A pull whose reference does not resolve fails the same way.
    const response = await harness?.server.call("POST", "/v1/sync", {
      token: a.token,
      body: {
        formatVersion: SYNC_FORMAT_VERSION,
        cursor: "0",
        push: [
          {
            tbl: "transactions",
            publicId: "77777777-7777-4777-8777-777777777777",
            hlc: `${String(harness?.server.clock.now).padStart(15, "0")}:00000:${a.deviceId}`,
            deleted: false,
            payload: {
              publicId: "77777777-7777-4777-8777-777777777777",
              createdAt: null,
              updatedAt: null,
              deletedAt: null,
              accountPublicId: "88888888-8888-4888-8888-888888888888",
              categoryPublicId: null,
              date: "2026-11-20",
              payee: "Nowhere",
              amount: -1,
              notes: null,
              cleared: false,
              reconciled: false,
              transferTransactionPublicId: null,
            },
          },
        ],
      },
    });
    expect(response?.status).toBe(200);
    await expect(join(b)).rejects.toBeInstanceOf(MissingReferenceError);
    expect(await localState(b)).toEqual(before);
  });
});
