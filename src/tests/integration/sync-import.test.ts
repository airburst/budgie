// SY-034: a portable import on a synced device (an export or a server
// snapshot) is a local edit of everything it writes or removes, and every
// device ends with exactly the imported data.
import {
  createPortableData,
  parsePortableData,
  PORTABLE_COLLECTIONS,
  PORTABLE_TABLES,
  sealPortableData,
  type PortableData,
  type PortableTable,
} from "@/services/portable-data";
import { importPortableData } from "@/services/portable-import";
import { InvalidOutgoingEnvelopeError } from "@/services/sync/errors";
import {
  compareHlc,
  parseHlc,
  sealHlcFromUpdatedAt,
} from "@/services/sync/hlc";
import { joinSync } from "@/services/sync/join";
import { toTimestamp, UUID_PATTERN } from "@/services/sync/payload";
import {
  comparable,
  createSyncHarness,
  type SyncedRow,
  type SyncHarness,
  type SyncHarnessClient,
} from "@/tests/helpers/sync-harness";
import { afterEach, describe, expect, it } from "vitest";
import { buildSnapshot } from "../../../sync-server/src/snapshot";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

const setup = async () => {
  harness = await createSyncHarness({ clients: 2 });
  const [a, b] = harness.clients as [SyncHarnessClient, SyncHarnessClient];
  return { h: harness, a, b };
};

const OPTS = {
  applicationVersion: "test",
  minimumReaderVersion: "1",
  exportedAt: "2026-11-22T00:00:00.000Z",
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

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
  categoryId: number | null = null,
) => {
  const [row] = await client.services.transactions.create({
    accountId,
    categoryId,
    date: "2026-11-20",
    payee,
    amount: -10,
    notes: null,
    cleared: false,
  });
  if (!row) throw new Error("transaction not created");
  return {
    id: row.id,
    publicId: await client.publicIdOf("transactions", row.id),
    transferTransactionId: row.transferTransactionId,
  };
};

const insertPayee = (
  client: SyncHarnessClient,
  publicId: string,
  name: string,
  offsetMs = 0,
) =>
  client.database.execute({
    sql: "INSERT INTO payees (public_id, name, amount, updated_at) VALUES (?, ?, 1, ?)",
    params: [publicId, name, toTimestamp(client.clock.now + offsetMs)],
  });

/** Accounts, a transfer, a deleted transaction, a payee, an envelope and its budget. */
const seedBooks = async (client: SyncHarnessClient, withTransfer = true) => {
  const current = await newAccount(client, "Current");
  const savings = await newAccount(client, "Savings");
  if (withTransfer) {
    const [transfer] = await client.database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE name = 'Savings' AND expense_type = 'transfer'",
    });
    await newTransaction(client, current.id, "To savings", transfer?.id);
  }
  const groceries = await newTransaction(client, current.id, "Tesco");
  const mistake = await newTransaction(client, current.id, "Mistake");
  await client.services.transactions.delete(mistake.id);
  await client.services.payees.create({
    name: "Tesco",
    categoryId: null,
    amount: null,
  });
  const [envelope] = await client.services.envelopes.create({
    name: "Food",
    active: true,
    sortOrder: 0,
  });
  if (!envelope) throw new Error("envelope not created");
  await client.services.budgets.upsertAllocation(envelope.id, "2026-11", 200);
  return { current, savings, groceries };
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

const serverMaxHlc = (h: SyncHarness) =>
  (
    h.server.db.prepare("SELECT MAX(hlc) AS hlc FROM changes").get() as {
      hlc: string;
    }
  ).hlc;

const serverRow = (h: SyncHarness, tbl: string, publicId: string) =>
  h.server.db
    .prepare(
      "SELECT hlc, deleted, payload FROM changes WHERE tbl = ? AND public_id = ?",
    )
    .get(tbl, publicId) as
    { hlc: string; deleted: number; payload: string } | undefined;

const rowsOf = (data: PortableData, table: PortableTable) =>
  data[PORTABLE_COLLECTIONS[table]] as Array<
    Record<string, unknown> & { publicId: string }
  >;

/** The package with `edit` applied to every row, checksum recomputed. */
const editPackage = (
  data: PortableData,
  edit: (
    table: PortableTable,
    row: Record<string, unknown> & { publicId: string },
  ) => Record<string, unknown>,
) => {
  const next = { ...data } as Record<string, unknown>;
  for (const table of PORTABLE_TABLES) {
    next[PORTABLE_COLLECTIONS[table]] = rowsOf(data, table).map((row) =>
      edit(table, row),
    );
  }
  return sealPortableData(next as PortableData);
};

/** Every row of the package, as `createPortableData` would export it. */
const exportedRows = async (client: SyncHarnessClient) => {
  const data = await createPortableData(client.database, OPTS);
  return new Map(
    PORTABLE_TABLES.flatMap((table) =>
      rowsOf(data, table).map((row) => [`${table}/${row.publicId}`, row]),
    ),
  );
};

/**
 * `client` holds exactly the package: every package row as written there
 * (the never-sent pending-reconcile fields aside), and every other row
 * deleted.
 */
const expectExactly = async (client: SyncHarnessClient, data: PortableData) => {
  const local = await exportedRows(client);
  const expected = new Set<string>();
  for (const table of PORTABLE_TABLES) {
    for (const row of rowsOf(data, table)) {
      const key = `${table}/${row.publicId}`;
      expected.add(key);
      const { pendingReconcileBalance, pendingReconcileDate, ...rest } = row;
      void pendingReconcileBalance;
      void pendingReconcileDate;
      expect(local.get(key), `${client.name} ${key}`).toMatchObject(rest);
    }
  }
  for (const [key, row] of local) {
    if (expected.has(key)) continue;
    expect(row.deletedAt, `${client.name} ${key} should be deleted`).not.toBe(
      null,
    );
  }
};

const live = (rows: SyncedRow[]) =>
  rows.filter((row) => row.payload.deletedAt === null);

const expectConverged = async (a: SyncHarnessClient, b: SyncHarnessClient) => {
  expect(comparable(await b.snapshot())).toEqual(
    comparable(await a.snapshot()),
  );
};

describe("portable import while synced", () => {
  it("dirties every imported row with an HLC that beats everything synced, deletes the rest, and a second device ends with exactly the package", async () => {
    const { h, a, b } = await setup();
    const { current } = await seedBooks(a);
    await a.sync();
    await b.sync();

    // Last month's backup: every row's updatedAt a month back.
    const backup = await editPackage(
      await createPortableData(a.database, OPTS),
      (_, row) => ({
        ...row,
        updatedAt: toTimestamp(a.clock.now - MONTH_MS),
      }),
    );

    // Edits after the backup, synced everywhere.
    await a.services.accounts.update(current.id, { name: "Current renamed" });
    const later = await newTransaction(a, current.id, "After the backup");
    await a.sync();
    await b.sync();
    const before = serverMaxHlc(h);

    a.clock.now += 60_000;
    await importPortableData(a.database, backup, { now: () => a.clock.now });

    // Every row in the package: dirty, sealed at the import, newer than
    // anything the server holds.
    const packageKeys = new Set(
      PORTABLE_TABLES.flatMap((table) =>
        rowsOf(backup, table).map((row) => `${table}/${row.publicId}`),
      ),
    );
    const rowsAfter = await a.snapshot();
    for (const row of rowsAfter) {
      if (!packageKeys.has(`${row.tbl}/${row.publicId}`)) continue;
      expect(row, `${row.tbl} ${row.publicId}`).toMatchObject({
        dirty: true,
        unsealed: false,
      });
      expect(compareHlc(row.hlc, before)).toBe(1);
      expect(parseHlc(row.hlc ?? "")?.wall).toBe(a.clock.now);
    }
    // updatedAt is the package's, also on rows the second pass completed.
    await expectExactly(a, backup);
    // The row the import removed is a deleted, dirty local edit.
    const removed = await a.row("transactions", later.publicId);
    expect(removed?.payload.deletedAt).not.toBeNull();
    expect(removed).toMatchObject({ dirty: true, unsealed: false });
    expect(compareHlc(removed?.hlc, before)).toBe(1);

    const pushed = await a.sync();
    expect(pushed.rejected).toEqual([]);
    // Deletes travel with their full payload.
    const stored = serverRow(h, "transactions", later.publicId);
    expect(stored?.deleted).toBe(1);
    expect(JSON.parse(stored?.payload ?? "{}")).toMatchObject({
      publicId: later.publicId,
      payee: "After the backup",
      amount: -10,
      accountPublicId: current.publicId,
    });

    await b.sync();
    await expectExactly(b, backup);
    await expectConverged(a, b);
    expect(
      (await b.services.accounts.getAll())
        .map((account) => account.name)
        .sort(),
    ).toEqual(["Current", "Savings"]);
  });

  it("beats an edit made elsewhere before the import that this device has not pulled yet", async () => {
    const { h, a, b } = await setup();
    const { current } = await seedBooks(a);
    await a.sync();
    await b.sync();
    const backup = await editPackage(
      await createPortableData(a.database, OPTS),
      (_, row) => ({
        ...row,
        updatedAt: toTimestamp(a.clock.now - MONTH_MS),
      }),
    );
    const synced = await a.row("accounts", current.publicId);

    // B renames the account ten seconds later (a user write giving its own
    // edit time) and syncs; A does not pull it before importing.
    await b.database.execute({
      sql: "UPDATE accounts SET name = 'Renamed on B', updated_at = ? WHERE public_id = ?",
      params: [toTimestamp(b.clock.now + 10_000), current.publicId],
    });
    await b.sync();
    const bHlc = serverRow(h, "accounts", current.publicId)?.hlc;

    // The seal rule from the package's updatedAt would only increment the
    // HLC A holds, which loses to B's edit.
    const fromPackage = sealHlcFromUpdatedAt(
      synced?.hlc,
      a.deviceId,
      toTimestamp(a.clock.now - MONTH_MS),
      a.clock.now,
    );
    expect(compareHlc(fromPackage, bHlc)).toBe(-1);

    a.clock.now += 60_000;
    await importPortableData(a.database, backup, { now: () => a.clock.now });
    const imported = await a.row("accounts", current.publicId);
    expect(compareHlc(imported?.hlc, bHlc)).toBe(1);

    expect((await a.sync()).rejected).toEqual([]);
    await b.sync();
    await expectExactly(b, backup);
    expect((await b.row("accounts", current.publicId))?.payload.name).toBe(
      "Current",
    );
    await expectConverged(a, b);
  });

  it("importing a server snapshot while synced brings every device back to it", async () => {
    const { h, a, b } = await setup();
    const { current, groceries } = await seedBooks(a, false);
    await start(a);
    await b.sync();
    const [user] = h.server.db.prepare("SELECT id FROM users").all() as Array<{
      id: string;
    }>;
    const snapshot = await parsePortableData(
      (await buildSnapshot(
        h.server.executor,
        user?.id ?? "",
        h.server.clock.now,
      )) ?? "",
    );

    // Later changes on B: an edit, a delete and a new row; A pulls them.
    const currentOnB = await b.database.query<{ id: number }>({
      sql: "SELECT id FROM accounts WHERE public_id = ?",
      params: [current.publicId],
    });
    const accountId = currentOnB[0]?.id ?? 0;
    await b.services.accounts.update(accountId, { name: "Changed on B" });
    const [groceriesOnB] = await b.database.query<{ id: number }>({
      sql: "SELECT id FROM transactions WHERE public_id = ?",
      params: [groceries.publicId],
    });
    await b.services.transactions.delete(groceriesOnB?.id ?? 0);
    const added = await newTransaction(b, accountId, "Added on B");
    await b.sync();
    await a.sync();
    const before = serverMaxHlc(h);

    a.clock.now += 60_000;
    await importPortableData(a.database, snapshot, { now: () => a.clock.now });
    for (const row of await a.snapshot()) {
      if (!row.dirty) continue;
      expect(compareHlc(row.hlc, before)).toBe(1);
    }
    expect((await a.sync()).rejected).toEqual([]);
    await b.sync();

    for (const client of [a, b]) await expectExactly(client, snapshot);
    await expectConverged(a, b);
    expect(
      (await b.row("transactions", added.publicId))?.payload.deletedAt,
    ).not.toBeNull();
    expect(
      (await b.row("transactions", groceries.publicId))?.payload.deletedAt,
    ).toBeNull();
  });
});

describe("portable import while synced: the tombstone store", () => {
  const W = "11111111-1111-4111-8111-111111111111";
  const L = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const N = "77777777-7777-4777-8777-777777777777";

  it("re-asserts stored rows the package does not hold as deletes, and they block nothing", async () => {
    const { h, a, b } = await setup();
    // The same payee on both ends: L ends in the store on both, deleted.
    await insertPayee(a, W, "Tesco");
    await insertPayee(b, L, "Tesco", 60_000);
    await a.sync();
    await b.sync();
    await a.sync();
    const storedBefore = await a.row("payees", L);
    expect(storedBefore?.payload.deletedAt).not.toBeNull();
    expect(storedBefore?.hlc).not.toBeNull();

    // The package holds a different live "Tesco" and neither W nor L.
    const exported = await createPortableData(a.database, OPTS);
    const data = await sealPortableData({
      ...exported,
      payees: [
        {
          publicId: N,
          createdAt: "2026-10-01 00:00:00",
          updatedAt: "2026-10-01 00:00:00",
          deletedAt: null,
          name: "Tesco",
          categoryPublicId: null,
          amount: 5,
        },
      ],
    });
    const before = serverMaxHlc(h);

    a.clock.now += 60_000;
    await importPortableData(a.database, data, { now: () => a.clock.now });
    const payees = await a.rows("payees");
    expect(live(payees).map((row) => row.publicId)).toEqual([N]);
    for (const row of payees) {
      expect(row, row.publicId).toMatchObject({ dirty: true, unsealed: false });
      expect(compareHlc(row.hlc, before)).toBe(1);
    }

    expect((await a.sync()).rejected).toEqual([]);
    await b.sync();
    expect(live(await b.rows("payees")).map((row) => row.publicId)).toEqual([
      N,
    ]);
    expect(serverRow(h, "payees", L)?.deleted).toBe(1);
    expect(serverRow(h, "payees", W)?.deleted).toBe(1);
    await expectConverged(a, b);

    // The key is free for new rows on either end.
    await b.services.payees.update(
      (await b.services.payees.getAll())[0]?.id ?? 0,
      { amount: 7 },
    );
    expect((await b.sync()).rejected).toEqual([]);
    expect((await a.sync()).rejected).toEqual([]);
    await expectConverged(a, b);
  });
});

describe("portable import while synced: wire formats", () => {
  it("rewrites non-UUID ids and normalises timestamps the way Start does, and the result syncs", async () => {
    const { a, b } = await setup();
    await seedBooks(a);
    await a.sync();
    await b.sync();
    const exported = await createPortableData(a.database, OPTS);
    const accounts = rowsOf(exported, "accounts");
    const legacy = new Map(
      accounts.map((row, index) => [
        row.publicId,
        `legacy:accounts:${index + 90}`,
      ]),
    );
    const data = await editPackage(exported, (table, row) => {
      const next: Record<string, unknown> = {
        ...row,
        updatedAt: "2026-10-01T10:00:00.000Z",
      };
      for (const [field, value] of Object.entries(row)) {
        if (typeof value === "string" && legacy.has(value)) {
          next[field] = legacy.get(value);
        }
      }
      if (table === "transactions") next.date = "2026-11-20T00:00:00Z";
      return next;
    });

    await importPortableData(a.database, data, { now: () => a.clock.now });
    for (const row of await a.snapshot()) {
      if (!row.dirty) continue;
      expect(row.publicId).toMatch(UUID_PATTERN);
      if (row.payload.deletedAt !== null) continue;
      expect(row.payload.updatedAt).toBe("2026-10-01 10:00:00");
      if (row.tbl === "transactions") {
        expect(row.payload.date).toBe("2026-11-20");
      }
    }
    expect((await a.sync()).rejected).toEqual([]);
    await b.sync();
    await expectConverged(a, b);
    expect(
      (await b.services.accounts.getAll())
        .map((account) => account.name)
        .sort(),
    ).toEqual(["Current", "Savings"]);
  });

  it("fails, changing nothing, when a row cannot be sent even after normalising", async () => {
    const { a } = await setup();
    await seedBooks(a);
    await a.sync();
    const exported = await createPortableData(a.database, OPTS);
    const data = await editPackage(exported, (table, row) =>
      table === "transactions" ? { ...row, date: "someday" } : row,
    );
    const before = await a.snapshot();
    await expect(
      importPortableData(a.database, data, { now: () => a.clock.now }),
    ).rejects.toBeInstanceOf(InvalidOutgoingEnvelopeError);
    expect(await a.snapshot()).toEqual(before);
  });

  it("leaves the old rows Join left behind alone: they are never pushed", async () => {
    const { a, b } = await setup();
    await seedBooks(a);
    await a.sync();
    // B's own books before it joined, one with a pre-sync id.
    const old = await newAccount(b, "Old books");
    await b.database.execute({
      sql: "UPDATE accounts SET public_id = 'legacy:accounts:77', sync_rev = sync_rev + 1 WHERE id = ?",
      params: [old.id],
    });
    await joinSync(b.database, b.deps());
    const backup = await createPortableData(a.database, OPTS);

    const sent = b.requests.length;
    await importPortableData(b.database, backup, { now: () => b.clock.now });
    expect(await b.row("accounts", "legacy:accounts:77")).toMatchObject({
      hlc: null,
      dirty: false,
    });
    expect((await b.sync()).rejected).toEqual([]);
    const pushedIds = b.requests
      .slice(sent)
      .flatMap((request) => request.push.map((envelope) => envelope.publicId));
    expect(pushedIds).not.toContain("legacy:accounts:77");
    expect(pushedIds).not.toContain(old.publicId);
    await a.sync();
    await expectExactly(a, backup);
    await expectExactly(b, backup);
  });
});
