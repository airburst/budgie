// SY-029: natural-key collisions (SPEC.md 8.10) between real client databases
// through the in-process sync server, and the tombstone store (migration
// 0015) that keeps the tables' UNIQUE constraints from failing an apply.
import { SYNC_FORMAT_VERSION, type SyncEnvelope } from "@/services/sync/payload";
import {
  comparable,
  createSyncHarness,
  type SyncedRow,
  type SyncHarness,
  type SyncHarnessClient,
} from "@/tests/helpers/sync-harness";
import { afterEach, describe, expect, it, vi } from "vitest";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

const setup = async (clients = 2) => {
  harness = await createSyncHarness({ clients });
  return harness;
};

const live = (rows: SyncedRow[]) =>
  rows.filter((row) => row.payload.deletedAt === null);

/** Rows of a table as a device's services see them (live, in the table). */
const liveInTable = (client: SyncHarnessClient, table: string) =>
  client.database.query<{ public_id: string }>({
    sql: `SELECT public_id FROM ${table} WHERE deleted_at IS NULL ORDER BY public_id`,
  });

const storeSize = async (client: SyncHarnessClient) =>
  (
    await client.database.query<{ n: number }>({
      sql: "SELECT count(*) AS n FROM sync_tombstones",
    })
  )[0]?.n ?? 0;

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

/** Real time plus `offsetMs` as a `timestamp` (the triggers use real time). */
const timestamp = (offsetMs: number) =>
  new Date(vi.getRealSystemTime() + offsetMs)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

/** A user insert with a chosen public id and edit time. */
const insertPayee = (
  client: SyncHarnessClient,
  publicId: string,
  name: string,
  amount: number,
  offsetMs = 0,
) =>
  client.database.execute({
    sql: "INSERT INTO payees (public_id, name, amount, updated_at) VALUES (?, ?, ?, ?)",
    params: [publicId, name, amount, timestamp(offsetMs)],
  });

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

/** An envelope created on `owner` and synced to every other client. */
const sharedEnvelope = async (
  clients: SyncHarnessClient[],
  name: string,
) => {
  const [owner, ...others] = clients as [
    SyncHarnessClient,
    ...SyncHarnessClient[],
  ];
  const [envelope] = await owner.services.envelopes.create({
    name,
    active: true,
    sortOrder: 0,
  });
  if (!envelope) throw new Error("envelope not created");
  const publicId = await owner.publicIdOf("envelopes", envelope.id);
  await owner.sync();
  for (const other of others) await other.sync();
  return publicId;
};

const W = "11111111-1111-4111-8111-111111111111";
const L = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";
const OTHER_DEVICE = "9d2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50";

/** Pushes one envelope as another device would (through `via`'s token). */
const pushAs = async (via: SyncHarnessClient, envelope: SyncEnvelope) => {
  const response = await harness?.server.call("POST", "/v1/sync", {
    token: via.token,
    body: { formatVersion: SYNC_FORMAT_VERSION, cursor: "0", push: [envelope] },
  });
  expect(response?.status).toBe(200);
  expect((response?.body as { rejected: unknown[] }).rejected).toEqual([]);
};

const hlcAt = (offsetMs: number) =>
  `${String((harness?.server.clock.now ?? 0) + offsetMs).padStart(15, "0")}:00000:${OTHER_DEVICE}`;

const payeePayload = (
  publicId: string,
  name: string,
  amount: number,
  deletedAt: string | null,
) => ({
  publicId,
  createdAt: "2026-11-22 10:00:00",
  updatedAt: "2026-11-22 10:00:00",
  deletedAt,
  name,
  categoryPublicId: null,
  amount,
});

describe("natural-key collisions: two devices", () => {
  for (const order of ["A first", "B first"] as const) {
    it(`the same payee created offline on both ends as one live payee (${order})`, async () => {
      const { clients } = await setup();
      const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
      await insertPayee(a, W, "Tesco", 10, 0);
      await insertPayee(b, L, "Tesco", 20, 60_000);
      const [first, second] = order === "A first" ? [a, b] : [b, a];

      await first.sync();
      await second.sync();
      await first.sync();

      await expectConverged(a, b);
      const rows = await a.rows("payees");
      expect(rows.map((row) => row.publicId)).toEqual([W, L]);
      // The lowest public id keeps the key, with the newest content (B's).
      expect(live(rows)).toEqual([
        expect.objectContaining({
          publicId: W,
          payload: expect.objectContaining({ name: "Tesco", amount: 20 }),
        }),
      ]);
      for (const client of [a, b]) {
        expect(await liveInTable(client, "payees")).toEqual([{ public_id: W }]);
        expect(await client.services.payees.getAll()).toHaveLength(1);
        expect(await storeSize(client)).toBe(1);
      }
      // The server holds a deleted version of the loser.
      expect(
        harness?.server.db
          .prepare("SELECT deleted FROM changes WHERE public_id = ?")
          .get(L),
      ).toEqual({ deleted: 1 });
    });

    it(`the same envelope category created offline on both ends as one link (${order})`, async () => {
      const { clients } = await setup();
      const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
      const food = await sharedEnvelope([a, b], "Food");
      const fun = await sharedEnvelope([b, a], "Fun");
      // Category 1 is a seeded expense category with a shared public id.
      await a.services.envelopes.createCategory({
        envelopeId: await localId(a, "envelopes", food),
        categoryId: 1,
      });
      await b.services.envelopes.createCategory({
        envelopeId: await localId(b, "envelopes", fun),
        categoryId: 1,
      });
      const [first, second] = order === "A first" ? [a, b] : [b, a];

      await first.sync();
      await second.sync();
      await first.sync();

      await expectConverged(a, b);
      const rows = await a.rows("envelope_categories");
      expect(rows).toHaveLength(2);
      expect(live(rows)).toHaveLength(1);
      for (const client of [a, b]) {
        expect(await client.services.envelopes.getCategories()).toHaveLength(1);
      }
    });

    it(`the same monthly allocation created offline on both ends as one allocation (${order})`, async () => {
      const { clients } = await setup();
      const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
      const food = await sharedEnvelope([a, b], "Food");
      await a.services.budgets.upsertAllocation(
        await localId(a, "envelopes", food),
        "2026-12",
        100,
      );
      await b.services.budgets.upsertAllocation(
        await localId(b, "envelopes", food),
        "2026-12",
        200,
      );
      // B's edit is the newer one.
      await b.database.execute({
        sql: "UPDATE budget_allocations SET updated_at = ?",
        params: [timestamp(60_000)],
      });
      const [first, second] = order === "A first" ? [a, b] : [b, a];

      await first.sync();
      await second.sync();
      await first.sync();

      await expectConverged(a, b);
      const rows = await a.rows("budget_allocations");
      expect(rows).toHaveLength(2);
      const [winner] = live(rows);
      expect(winner?.publicId).toBe(
        [...rows.map((row) => row.publicId)].sort()[0],
      );
      expect(winner?.payload.assigned).toBe(200);
      for (const client of [a, b]) {
        expect(
          await client.services.budgets.getAllocationsByMonth("2026-12"),
        ).toHaveLength(1);
      }
    });
  }
});

describe("natural-key collisions: three devices", () => {
  it("three devices with one payee name each end with one live payee", async () => {
    const { clients } = await setup(3);
    const [a, b, c] = clients as [
      SyncHarnessClient,
      SyncHarnessClient,
      SyncHarnessClient,
    ];
    await insertPayee(a, L, "Rent", 1, 0);
    await insertPayee(b, P1, "Rent", 2, 30_000);
    await insertPayee(c, P2, "Rent", 3, 60_000);

    await c.sync();
    await a.sync();
    await b.sync();
    await c.sync();
    await a.sync();

    await expectConverged(a, b, c);
    const rows = await a.rows("payees");
    expect(rows).toHaveLength(3);
    expect(live(rows)).toEqual([
      expect.objectContaining({
        publicId: P1,
        payload: expect.objectContaining({ amount: 3 }),
      }),
    ]);
  });
});

describe("the tombstone store", () => {
  it("an apply never aborts on a unique constraint: a deleted row steps aside", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    // B has a deleted payee holding the name; A creates it anew.
    await insertPayee(b, W, "Gym", 5);
    await b.services.payees.delete(await localId(b, "payees", W));
    await b.sync();
    // A has not seen it yet; its pull stores W, as L holds the name.
    await insertPayee(a, L, "Gym", 7);
    await a.sync();
    expect(await storeSize(a)).toBe(1);

    await b.sync();
    await expectConverged(a, b);
    expect(await liveInTable(b, "payees")).toEqual([{ public_id: L }]);
    expect(await b.row("payees", W)).toMatchObject({
      payload: expect.objectContaining({ deletedAt: expect.any(String) }),
    });
    expect(await storeSize(b)).toBe(1);
    // Every row, stored or not, is exported.
    expect(
      (await a.snapshot()).filter((row) => row.tbl === "payees"),
    ).toHaveLength(2);
  });

  it("applies two payees swapping names in one pull", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    await insertPayee(a, P1, "Alpha", 1);
    await insertPayee(a, P2, "Beta", 2);
    await a.sync();
    await b.sync();
    const id1 = await localId(a, "payees", P1);
    const id2 = await localId(a, "payees", P2);
    await a.services.payees.update(id1, { name: "Swap" });
    await a.services.payees.update(id2, { name: "Alpha" });
    await a.services.payees.update(id1, { name: "Beta" });
    await a.sync();

    await b.sync();
    await expectConverged(a, b);
    const names = await b.database.query({
      sql: "SELECT public_id, name FROM payees ORDER BY public_id",
    });
    expect(names).toEqual([
      { public_id: P1, name: "Beta" },
      { public_id: P2, name: "Alpha" },
    ]);
    expect(await storeSize(b)).toBe(0);
  });

  it("an undelete of a stored row moves it back into its table", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    await insertPayee(a, W, "Cafe", 1);
    await a.sync();
    // Another device sends a deleted version of L with the same name: it is
    // stored, because W holds the key.
    await pushAs(b, {
      tbl: "payees",
      publicId: L,
      hlc: hlcAt(-60_000),
      deleted: true,
      payload: payeePayload(L, "Cafe", 9, "2026-11-22 10:00:00"),
    });
    await a.sync();
    expect(await storeSize(a)).toBe(1);

    // W is deleted, then L is undeleted elsewhere.
    await a.services.payees.delete(await localId(a, "payees", W));
    await a.sync();
    await pushAs(b, {
      tbl: "payees",
      publicId: L,
      hlc: hlcAt(1_000),
      deleted: false,
      payload: payeePayload(L, "Cafe", 9, null),
    });
    await a.sync();

    expect(await liveInTable(a, "payees")).toEqual([{ public_id: L }]);
    expect(await a.row("payees", L)).toMatchObject({
      hlc: hlcAt(1_000),
      dirty: false,
      payload: expect.objectContaining({ amount: 9, deletedAt: null }),
    });
    // W stepped aside into the store, deleted and acknowledged.
    expect(await storeSize(a)).toBe(1);
    expect(await a.row("payees", W)).toMatchObject({
      dirty: false,
      payload: expect.objectContaining({ deletedAt: expect.any(String) }),
    });
  });

  it("an undelete of a stored row into a held key goes through resolution", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    await insertPayee(a, W, "Cafe", 1);
    await a.sync();
    await pushAs(b, {
      tbl: "payees",
      publicId: L,
      hlc: hlcAt(-60_000),
      deleted: true,
      payload: payeePayload(L, "Cafe", 9, "2026-11-22 10:00:00"),
    });
    await a.sync();
    // L comes back live with newer content while W still holds the name.
    await pushAs(b, {
      tbl: "payees",
      publicId: L,
      hlc: hlcAt(1_000),
      deleted: false,
      payload: payeePayload(L, "Cafe", 9, null),
    });
    const result = await a.sync();

    // W keeps the key and takes L's newer content; L is deleted again and
    // pushed in the next round of the same cycle.
    expect(result.rounds).toBe(2);
    expect(await liveInTable(a, "payees")).toEqual([{ public_id: W }]);
    expect(await a.row("payees", W)).toMatchObject({
      dirty: false,
      payload: expect.objectContaining({ amount: 9 }),
    });
    expect(await a.row("payees", L)).toMatchObject({
      dirty: false,
      payload: expect.objectContaining({ deletedAt: expect.any(String) }),
    });
    expect(await storeSize(a)).toBe(1);
  });

  it("a new payee whose name is held only by a stored tombstone is a new row", async () => {
    const { clients } = await setup();
    const [a, b] = clients as [SyncHarnessClient, SyncHarnessClient];
    await insertPayee(a, W, "Pub", 1);
    await insertPayee(b, L, "Pub", 2);
    await a.sync();
    await b.sync();
    await a.sync();
    expect(await storeSize(a)).toBe(1);

    // W is renamed: "Pub" is now held only by L, in the store.
    await a.services.payees.update(await localId(a, "payees", W), {
      name: "Bar",
    });
    const [created] = await a.services.payees.create({
      name: "Pub",
      categoryId: null,
      amount: 3,
    });
    expect(created?.publicId).not.toBe(W);
    expect(created?.publicId).not.toBe(L);
    await a.sync();
    await b.sync();
    await expectConverged(a, b);
    expect(
      (await b.services.payees.getAll()).map((payee) => payee.name).sort(),
    ).toEqual(["Bar", "Pub"]);

    // Deleting a payee whose name a stored row also has leaves it in the
    // table, where the services revive it as before.
    await b.services.payees.delete(await localId(b, "payees", W));
    const [revived] = await b.services.payees.create({
      name: "Bar",
      categoryId: null,
      amount: 4,
    });
    expect(revived?.publicId).toBe(W);
  });
});
