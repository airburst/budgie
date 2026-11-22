// SY-028: auto-posted occurrences get deterministic ids (SPEC 8.9), so two
// devices that post the same occurrence offline end up with one transaction.
import {
  createScheduledTransactionService,
  processAutoPost,
} from "@/services/scheduled-transactions";
import { autoPostTransactionId } from "@/services/sync/ids";
import {
  createSyncHarness,
  type SyncHarness,
  type SyncHarnessClient,
} from "@/tests/helpers/sync-harness";
import { afterEach, describe, expect, it } from "vitest";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

// System time is pinned to 2026-03-07 by setup.ts.
const TODAY = new Date("2026-03-07T00:00:00.000Z");
const HOUR = 3_600_000;

type Row = Record<string, unknown>;

const q = <T extends Row>(client: SyncHarnessClient, sql: string) =>
  client.database.query<T>({ sql });

const account = async (client: SyncHarnessClient, name: string) => {
  const [row] = await client.services.accounts.create({
    name,
    number: null,
    type: "bank",
    balance: 0,
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

const category = async (
  client: SyncHarnessClient,
  name: string,
  parentId: number | null,
) => {
  const [row] = await client.services.categories.create({
    parentId,
    name,
    expenseType: "transfer",
    publicId: null,
    updatedAt: null,
    deletedAt: null,
  });
  if (!row) throw new Error("category not created");
  return row.id;
};

/** Accounts "Current" and "Savings", a Transfer > Savings category, and two
 * monthly auto-post schedules (plain and transfer), synced to every client. */
const setup = async () => {
  harness = await createSyncHarness({ clients: 3 });
  const [a, b, c] = harness.clients as [
    SyncHarnessClient,
    SyncHarnessClient,
    SyncHarnessClient,
  ];
  const current = await account(a, "Current");
  const savings = await account(a, "Savings");
  const parent = await category(a, "Transfer", null);
  const toSavings = await category(a, "Savings", parent);
  await category(a, "Current", parent);
  const scheduled = createScheduledTransactionService(a.database);
  const base = {
    accountId: current,
    rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
    nextDueDate: "2026-01-01",
    autoPost: true,
    daysInAdvance: null,
    notes: null,
    active: true,
  };
  await scheduled.create({
    ...base,
    categoryId: null,
    payee: "Rent",
    amount: -500,
    transferToAccountId: null,
  });
  await scheduled.create({
    ...base,
    categoryId: toSavings,
    payee: "Save",
    amount: -100,
    transferToAccountId: savings,
  });
  await a.sync();
  await b.sync();
  await c.sync();
  return { a, b, c };
};

const dueDates = (client: SyncHarnessClient) =>
  q<{ payee: string; next_due_date: string }>(
    client,
    "SELECT payee, next_due_date FROM scheduled_transactions ORDER BY payee",
  );

const txns = (client: SyncHarnessClient) =>
  q<{
    public_id: string;
    payee: string;
    date: string;
    deleted_at: string | null;
  }>(
    client,
    "SELECT public_id, payee, date, deleted_at FROM transactions ORDER BY public_id",
  );

const AFTER_MARCH = [
  { payee: "Rent", next_due_date: "2026-04-01" },
  { payee: "Save", next_due_date: "2026-04-01" },
];

describe("auto-post across devices", () => {
  it("two clients posting the same occurrences offline converge on one each", async () => {
    const { a, b } = await setup();
    b.clock.now += HOUR;
    await processAutoPost(a.database, TODAY);
    await processAutoPost(b.database, TODAY);

    // 3 occurrences (Jan, Feb, Mar): 3 plain + 3 transfer pairs = 9 rows,
    // already identical by id before any sync.
    expect(await txns(a)).toHaveLength(9);
    expect((await txns(a)).map((t) => t.public_id)).toEqual(
      (await txns(b)).map((t) => t.public_id),
    );

    await a.sync();
    await b.sync();
    await a.sync();

    for (const client of [a, b]) {
      const rows = await txns(client);
      expect(rows).toHaveLength(9);
      expect(rows.filter((t) => t.payee === "Rent")).toHaveLength(3);
      expect(rows.filter((t) => t.payee === "Save")).toHaveLength(6);
      expect(rows.every((t) => t.deleted_at === null)).toBe(true);
      const links = await q<{ n: number }>(
        client,
        `SELECT COUNT(*) AS n FROM transactions t
         JOIN transactions o ON o.id = t.transfer_transaction_id
         WHERE o.transfer_transaction_id = t.id AND t.payee = 'Save'`,
      );
      expect(links[0]?.n).toBe(6);
    }
    expect((await txns(a)).map((t) => t.public_id)).toEqual(
      (await txns(b)).map((t) => t.public_id),
    );
    expect(await dueDates(a)).toEqual(AFTER_MARCH);
    expect(await dueDates(b)).toEqual(AFTER_MARCH);
  });

  it("uses the SPEC 8.9 ids for both legs", async () => {
    const { a } = await setup();
    await processAutoPost(a.database, TODAY);
    const [save] = await q<{ public_id: string }>(
      a,
      "SELECT public_id FROM scheduled_transactions WHERE payee = 'Save'",
    );
    const schedule = save?.public_id ?? "";
    const january = (await txns(a))
      .filter((t) => t.payee === "Save" && t.date === "2026-01-01")
      .map((t) => t.public_id);
    expect(january.sort()).toEqual(
      [
        await autoPostTransactionId(schedule, "2026-01-01", "account"),
        await autoPostTransactionId(schedule, "2026-01-01", "transfer"),
      ].sort(),
    );
  });

  it("does not resurrect a deleted auto-posted transaction", async () => {
    const { a, b } = await setup();
    b.clock.now += HOUR;
    await processAutoPost(a.database, TODAY);
    await processAutoPost(b.database, TODAY);

    // B syncs, then deletes a plain and a transfer occurrence, and syncs.
    await b.sync();
    b.clock.now += HOUR;
    const [rent] = await q<{ id: number }>(
      b,
      "SELECT id FROM transactions WHERE payee = 'Rent' AND date = '2026-01-01'",
    );
    const [save] = await q<{ id: number }>(
      b,
      "SELECT id FROM transactions WHERE payee = 'Save' AND date = '2026-01-01' AND amount < 0",
    );
    await b.services.transactions.delete(rent?.id ?? 0);
    await b.services.transactions.delete(save?.id ?? 0);
    await b.sync();

    // A posted the same occurrences with an older HLC; syncing must not revive them.
    await a.sync();
    await b.sync();
    for (const client of [a, b]) {
      const rows = (await txns(client)).filter((t) => t.date === "2026-01-01");
      expect(rows).toHaveLength(3);
      expect(rows.filter((t) => t.deleted_at === null)).toHaveLength(0);
    }

    // B's own auto-post, with the occurrence due again, creates nothing.
    await b.database.execute({
      sql: "UPDATE scheduled_transactions SET next_due_date = '2026-01-01'",
    });
    await processAutoPost(b.database, TODAY);
    const rows = await txns(b);
    expect(rows).toHaveLength(9);
    expect(
      rows.filter((t) => t.date === "2026-01-01" && t.deleted_at === null),
    ).toHaveLength(0);
    expect(await dueDates(b)).toEqual(AFTER_MARCH);
  });

  it("still posts, with a random id, for a schedule without a canonical public id", async () => {
    const { a } = await setup();
    await a.database.execute({
      sql: "UPDATE scheduled_transactions SET public_id = 'legacy:scheduled_transactions:1' WHERE payee = 'Rent'",
    });
    await processAutoPost(a.database, TODAY);
    const rent = (await txns(a)).filter((t) => t.payee === "Rent");
    expect(rent).toHaveLength(3);
    for (const t of rent) {
      expect(t.public_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
});
