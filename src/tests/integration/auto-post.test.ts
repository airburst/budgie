import { createRequire } from "module";
import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";

const require = createRequire(import.meta.url);
const { processAutoPost } = require("../../../public/ipc/scheduled-transactions.js") as {
  processAutoPost: (db: unknown, schema: unknown) => Promise<void>;
};

// System time is pinned to 2026-03-07T00:00:00.000Z by setup.ts

async function seedAccount(db: ReturnType<typeof createTestDb>["db"], schema: ReturnType<typeof createTestDb>["schema"]) {
  const [row] = await db
    .insert(schema.accounts)
    .values({ name: "Test Account", type: "bank", balance: 0 })
    .returning();
  return row.id;
}

// ── Suite 1: skip conditions ───────────────────────────────────────────────────

describe("processAutoPost — skip conditions", () => {
  const { db, schema, teardown } = createTestDb();
  afterAll(() => teardown());

  let accountId: number;

  it("setup account", async () => {
    accountId = await seedAccount(db, schema);
  });

  it("autoPost: false — no transaction inserted", async () => {
    await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Manual Only",
      amount: -100,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      nextDueDate: "2026-03-01",
      autoPost: false,
      active: true,
    });

    await processAutoPost(db, schema);

    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(0);
  });

  it("active: false — no transaction inserted", async () => {
    await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Inactive",
      amount: -50,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      nextDueDate: "2026-03-01",
      autoPost: true,
      active: false,
    });

    await processAutoPost(db, schema);

    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(0);
  });

  it("null nextDueDate — no crash, no transaction inserted", async () => {
    await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "No Due Date",
      amount: -50,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      nextDueDate: null,
      autoPost: true,
      active: true,
    });

    await expect(processAutoPost(db, schema)).resolves.toBeUndefined();

    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(0);
  });

  it("future nextDueDate with daysInAdvance: null — no transaction inserted", async () => {
    await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Future Payment",
      amount: -50,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=8",
      nextDueDate: "2026-03-08",
      autoPost: true,
      active: true,
      daysInAdvance: null,
    });

    await processAutoPost(db, schema);

    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(0);
  });
});

// ── Suite 2: daysInAdvance threshold ──────────────────────────────────────────

describe("processAutoPost — daysInAdvance threshold", () => {
  const { db, schema, teardown } = createTestDb();
  afterAll(() => teardown());

  let accountId: number;

  it("setup account", async () => {
    accountId = await seedAccount(db, schema);
  });

  it("due today (daysInAdvance: null defaults to 0) — posts", async () => {
    await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Due Today",
      amount: -10,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=7",
      nextDueDate: "2026-03-07",
      autoPost: true,
      active: true,
      daysInAdvance: null,
    });

    await processAutoPost(db, schema);

    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(1);
  });

  it("future exactly on daysInAdvance boundary — posts", async () => {
    await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Boundary Post",
      amount: -20,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=12",
      nextDueDate: "2026-03-12",
      autoPost: true,
      active: true,
      daysInAdvance: 5,
    });

    await processAutoPost(db, schema);

    const txns = await db.select().from(schema.transactions);
    const hit = txns.find((t: { payee: string }) => t.payee === "Boundary Post");
    expect(hit).toBeDefined();
  });

  it("future one day outside daysInAdvance — does not post", async () => {
    await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Just Outside Window",
      amount: -30,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=13",
      nextDueDate: "2026-03-13",
      autoPost: true,
      active: true,
      daysInAdvance: 5,
    });

    await processAutoPost(db, schema);

    const txns = await db.select().from(schema.transactions);
    const hit = txns.find((t: { payee: string }) => t.payee === "Just Outside Window");
    expect(hit).toBeUndefined();
  });
});

// ── Suite 3: transaction field mapping ────────────────────────────────────────

describe("processAutoPost — transaction field mapping", () => {
  const { db, schema, teardown } = createTestDb();
  afterAll(() => teardown());

  let accountId: number;
  let categoryId: number;

  it("setup account and category", async () => {
    accountId = await seedAccount(db, schema);
    const cats = await db.select().from(schema.categories);
    categoryId = cats[0].id;
  });

  it("inserted transaction has correct fields and date equals nextDueDate", async () => {
    await db.insert(schema.scheduledTransactions).values({
      accountId,
      categoryId,
      payee: "Netflix",
      amount: -12.99,
      notes: "streaming",
      rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
      nextDueDate: "2026-03-05",
      autoPost: true,
      active: true,
    });

    await processAutoPost(db, schema);

    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(1);
    const t = txns[0];
    expect(t.accountId).toBe(accountId);
    expect(t.categoryId).toBe(categoryId);
    expect(t.payee).toBe("Netflix");
    expect(t.amount).toBe(-12.99);
    expect(t.notes).toBe("streaming");
    expect(t.date).toBe("2026-03-05");
    expect(t.cleared).toBe(false);
    expect(t.reconciled).toBe(false);
  });
});

// ── Suite 4: nextDueDate advancement ──────────────────────────────────────────

describe("processAutoPost — nextDueDate advancement", () => {
  const { db, schema, teardown } = createTestDb();
  afterAll(() => teardown());

  let accountId: number;
  let monthlyId: number;
  let weeklyId: number;
  let onceId: number;
  let futureId: number;

  it("setup account and seed scheduled transactions", async () => {
    accountId = await seedAccount(db, schema);

    const [m] = await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Monthly Bill",
      amount: -50,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=5",
      nextDueDate: "2026-03-05",
      autoPost: true,
      active: true,
    }).returning();
    monthlyId = m.id;

    const [w] = await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Weekly Sub",
      amount: -10,
      rrule: "FREQ=WEEKLY;BYDAY=WE",
      nextDueDate: "2026-03-04",
      autoPost: true,
      active: true,
    }).returning();
    weeklyId = w.id;

    const [o] = await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "One-Off",
      amount: -200,
      rrule: "FREQ=DAILY;COUNT=1",
      nextDueDate: "2026-03-01",
      autoPost: true,
      active: true,
    }).returning();
    onceId = o.id;

    const [f] = await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Future Standing Order",
      amount: -100,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=20",
      nextDueDate: "2026-03-20",
      autoPost: true,
      active: true,
    }).returning();
    futureId = f.id;
  });

  it("run processAutoPost", async () => {
    await processAutoPost(db, schema);
  });

  it("monthly: nextDueDate advances to next month", async () => {
    const rows = await db.select().from(schema.scheduledTransactions);
    const monthly = rows.find((r: { id: number }) => r.id === monthlyId);
    expect(monthly?.nextDueDate).toBe("2026-04-05");
  });

  it("weekly (BYDAY=WE): nextDueDate advances to next Wednesday", async () => {
    const rows = await db.select().from(schema.scheduledTransactions);
    const weekly = rows.find((r: { id: number }) => r.id === weeklyId);
    expect(weekly?.nextDueDate).toBe("2026-03-11");
  });

  it("once (COUNT=1): nextDueDate becomes null", async () => {
    const rows = await db.select().from(schema.scheduledTransactions);
    const once = rows.find((r: { id: number }) => r.id === onceId);
    expect(once?.nextDueDate).toBeNull();
  });

  it("future payment not due: nextDueDate is unchanged", async () => {
    const rows = await db.select().from(schema.scheduledTransactions);
    const future = rows.find((r: { id: number }) => r.id === futureId);
    expect(future?.nextDueDate).toBe("2026-03-20");
  });
});

// ── Suite 5: catch-up loop ────────────────────────────────────────────────────

describe("processAutoPost — catch-up loop (3 months overdue)", () => {
  const { db, schema, teardown } = createTestDb();
  afterAll(() => teardown());

  let accountId: number;
  let schedId: number;

  it("setup: monthly payment last ran 2026-01-07", async () => {
    accountId = await seedAccount(db, schema);
    const [row] = await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Overdue Bill",
      amount: -75,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=7",
      nextDueDate: "2026-01-07",
      autoPost: true,
      active: true,
      daysInAdvance: 0,
    }).returning();
    schedId = row.id;
  });

  it("run processAutoPost", async () => {
    await processAutoPost(db, schema);
  });

  it("3 transactions created (Jan 7, Feb 7, Mar 7)", async () => {
    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(3);
    const dates = txns.map((t: { date: string }) => t.date).sort();
    expect(dates).toEqual(["2026-01-07", "2026-02-07", "2026-03-07"]);
  });

  it("nextDueDate advanced past today to 2026-04-07", async () => {
    const rows = await db.select().from(schema.scheduledTransactions);
    const sched = rows.find((r: { id: number }) => r.id === schedId);
    expect(sched?.nextDueDate).toBe("2026-04-07");
  });
});

// ── Suite 6: idempotency ───────────────────────────────────────────────────────

describe("processAutoPost — idempotency (re-run same day)", () => {
  const { db, schema, teardown } = createTestDb();
  afterAll(() => teardown());

  let accountId: number;

  it("setup and first run", async () => {
    accountId = await seedAccount(db, schema);
    await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Subscription",
      amount: -9.99,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=7",
      nextDueDate: "2026-03-07",
      autoPost: true,
      active: true,
    });

    await processAutoPost(db, schema);

    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(1);
  });

  it("second run on same day inserts nothing more", async () => {
    await processAutoPost(db, schema);

    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(1);
  });
});

// ── Suite 7: multiple scheduled transactions in one sweep ─────────────────────

describe("processAutoPost — multiple items, only autoPost ones processed", () => {
  const { db, schema, teardown } = createTestDb();
  afterAll(() => teardown());

  let accountId: number;
  let schedBId: number;
  let schedCId: number;

  it("setup: two autoPost items and one manual item, all overdue", async () => {
    accountId = await seedAccount(db, schema);

    await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Auto A",
      amount: -10,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      nextDueDate: "2026-03-01",
      autoPost: true,
      active: true,
    });

    const [b] = await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Auto B",
      amount: -20,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      nextDueDate: "2026-03-01",
      autoPost: true,
      active: true,
    }).returning();
    schedBId = b.id;

    const [c] = await db.insert(schema.scheduledTransactions).values({
      accountId,
      payee: "Manual C",
      amount: -30,
      rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
      nextDueDate: "2026-03-01",
      autoPost: false,
      active: true,
    }).returning();
    schedCId = c.id;
  });

  it("run processAutoPost", async () => {
    await processAutoPost(db, schema);
  });

  it("exactly 2 transactions inserted (Auto A and Auto B)", async () => {
    const txns = await db.select().from(schema.transactions);
    expect(txns).toHaveLength(2);
    const payees = txns.map((t: { payee: string }) => t.payee).sort();
    expect(payees).toEqual(["Auto A", "Auto B"]);
  });

  it("Manual C nextDueDate is unchanged", async () => {
    const rows = await db.select().from(schema.scheduledTransactions);
    const c = rows.find((r: { id: number }) => r.id === schedCId);
    expect(c?.nextDueDate).toBe("2026-03-01");
  });

  it("Auto B nextDueDate is advanced", async () => {
    const rows = await db.select().from(schema.scheduledTransactions);
    const b = rows.find((r: { id: number }) => r.id === schedBId);
    expect(b?.nextDueDate).toBe("2026-04-01");
  });
});
