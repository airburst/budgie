import * as schema from "@/main/db/schema";
import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

export const PORTABLE_FIXTURE_OPTIONS = {
  applicationVersion: "1.0.0",
  minimumReaderVersion: "1.0.0",
  exportedAt: "2026-03-07T00:00:00.000Z",
} as const;

/** In-memory migrated database behind the DatabaseCapability interface. */
export const createCapabilityDatabase = (): {
  database: DatabaseCapability;
  close: () => void;
} => {
  const sqlite = new Database(":memory:");
  migrate(drizzle(sqlite, { schema }), {
    migrationsFolder: "src/main/db/migrations",
  });
  const run = (statement: DatabaseStatement) => {
    sqlite.prepare(statement.sql).run(...(statement.params ?? []));
  };
  const all = <T extends DatabaseRow>(statement: DatabaseStatement) =>
    sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as T[];
  const transaction = (): DatabaseTransaction => ({
    execute: async (statement) => run(statement),
    query: async <T extends DatabaseRow>(statement: DatabaseStatement) =>
      all<T>(statement),
  });
  const database: DatabaseCapability = {
    execute: async (statement) => run(statement),
    query: async <T extends DatabaseRow>(statement: DatabaseStatement) =>
      all<T>(statement),
    transaction: async <T>(
      operation: (tx: DatabaseTransaction) => Promise<T>,
    ) => {
      sqlite.exec("BEGIN;");
      try {
        const result = await operation(transaction());
        sqlite.exec("COMMIT;");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK;");
        throw error;
      }
    },
    migrate: async () => undefined,
    close: async () => {
      sqlite.close();
    },
  };
  return { database, close: () => sqlite.close() };
};

const T1 = "2026-02-01 10:00:00";
const T2 = "2026-02-15 12:30:00";
const T3 = "2026-03-01 08:15:00";

/**
 * A database with one or more rows in every synced table: a category tree,
 * a transfer pair, tombstones, pending reconcile state and account shortcuts.
 * Everything is explicit so the export is deterministic.
 */
export const buildPortableFixtureDatabase = async () => {
  const { database, close } = createCapabilityDatabase();
  const run = (sql: string, params: Array<string | number | null> = []) =>
    database.execute({ sql, params });

  // Seeded categories carry run-dependent timestamps; pin them.
  await run(
    "UPDATE categories SET created_at = ?, updated_at = ? WHERE public_id LIKE 'legacy:%'",
    [T1, T1],
  );

  const account = (
    id: string,
    name: string,
    type: string,
    balance: number,
    extra: {
      number?: string | null;
      notes?: string | null;
      rate?: number | null;
      limit?: number | null;
      deleted?: number;
      deletedAt?: string | null;
      pendingBalance?: number | null;
      pendingDate?: string | null;
    } = {},
  ) =>
    run(
      `INSERT INTO accounts (public_id, created_at, updated_at, deleted_at, name,
        number, type, balance, currency, notes, interest_rate, credit_limit,
        deleted, pending_reconcile_balance, pending_reconcile_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GBP', ?, ?, ?, ?, ?, ?)`,
      [
        id,
        T1,
        T2,
        extra.deletedAt ?? null,
        name,
        extra.number ?? null,
        type,
        balance,
        extra.notes ?? null,
        extra.rate ?? null,
        extra.limit ?? null,
        extra.deleted ?? 0,
        extra.pendingBalance ?? null,
        extra.pendingDate ?? null,
      ],
    );
  await account("acc-current", "Current", "bank", 1250.5, {
    number: "12-34-56",
    notes: "Main é account",
    pendingBalance: 1301.25,
    pendingDate: "2026-02-28",
  });
  await account("acc-savings", "Savings", "bank", 5000, { rate: 3.25 });
  await account("acc-card", "Card", "credit_card", -200, { limit: 3000 });
  await account("acc-old", "Closed", "cash", 0, {
    deleted: 1,
    deletedAt: T3,
  });

  const category = (
    id: string,
    name: string,
    type: string,
    parent: string | null,
    deletedAt: string | null = null,
  ) =>
    run(
      `INSERT INTO categories (public_id, created_at, updated_at, deleted_at,
        parent_id, name, expense_type, deleted)
        VALUES (?, ?, ?, ?, (SELECT id FROM categories WHERE public_id = ?), ?, ?, ?)`,
      [id, T1, T2, deletedAt, parent, name, type, deletedAt ? 1 : 0],
    );
  await category("cat-bills", "Bills", "expense", null);
  await category("cat-energy", "Energy", "expense", "cat-bills");
  await category("cat-salary", "Salary", "income", null);
  await category("cat-food", "Food", "expense", null);
  await category("cat-old", "Old", "expense", "cat-bills", T3);

  const envelope = (id: string, name: string, active: number, sort: number) =>
    run(
      `INSERT INTO envelopes (public_id, created_at, updated_at, deleted_at, name, active, sort_order)
        VALUES (?, ?, ?, NULL, ?, ?, ?)`,
      [id, T1, T2, name, active, sort],
    );
  await envelope("env-home", "Home", 1, 0);
  await envelope("env-fun", "Fun", 0, 1);

  const tx = (
    id: string,
    acc: string,
    cat: string | null,
    date: string,
    payee: string,
    amount: number,
    flags: { cleared?: number; reconciled?: number; deletedAt?: string } = {},
  ) =>
    run(
      `INSERT INTO transactions (public_id, created_at, updated_at, deleted_at,
        account_id, category_id, date, payee, amount, notes, cleared, reconciled)
        VALUES (?, ?, ?, ?, (SELECT id FROM accounts WHERE public_id = ?),
          (SELECT id FROM categories WHERE public_id = ?), ?, ?, ?, ?, ?, ?)`,
      [
        id,
        T1,
        T2,
        flags.deletedAt ?? null,
        acc,
        cat,
        date,
        payee,
        amount,
        payee === "Octopus" ? "Quarterly 日本語" : null,
        flags.cleared ?? 0,
        flags.reconciled ?? 0,
      ],
    );
  await tx(
    "tx-1",
    "acc-current",
    "cat-energy",
    "2026-02-03",
    "Octopus",
    -88.1,
    {
      cleared: 1,
    },
  );
  await tx("tx-2", "acc-current", "cat-salary", "2026-02-25", "Acme", 2500, {
    cleared: 1,
    reconciled: 1,
  });
  await tx("tx-3", "acc-current", null, "2026-02-26", "Transfer out", -300);
  await tx("tx-4", "acc-savings", null, "2026-02-26", "Transfer in", 300);
  await tx("tx-5", "acc-card", "cat-food", "2026-02-27", "Deli", -12.34, {
    deletedAt: T3,
  });
  await run(
    `UPDATE transactions SET transfer_transaction_id =
       (SELECT id FROM transactions WHERE public_id = 'tx-4'), updated_at = '2026-02-20 09:00:00' WHERE public_id = 'tx-3'`,
  );
  await run(
    `UPDATE transactions SET transfer_transaction_id =
       (SELECT id FROM transactions WHERE public_id = 'tx-3'), updated_at = '2026-02-20 09:00:00' WHERE public_id = 'tx-4'`,
  );

  await run(
    `INSERT INTO account_reconciliations (public_id, created_at, updated_at, deleted_at, account_id, date, balance, notes)
      VALUES ('rec-1', ?, ?, NULL, (SELECT id FROM accounts WHERE public_id = 'acc-current'), '2026-01-31', 900.5, 'January')`,
    [T1, T2],
  );

  await run(
    `INSERT INTO scheduled_transactions (public_id, created_at, updated_at, deleted_at,
      account_id, category_id, payee, amount, rrule, next_due_date, auto_post,
      days_in_advance, notes, active, transfer_to_account_id)
      VALUES ('sch-1', ?, ?, NULL, (SELECT id FROM accounts WHERE public_id = 'acc-current'),
        (SELECT id FROM categories WHERE public_id = 'cat-energy'), 'Octopus', -90,
        'FREQ=MONTHLY;BYMONTHDAY=3', '2026-03-03', 1, 2, NULL, 1, NULL),
        ('sch-2', ?, ?, NULL, (SELECT id FROM accounts WHERE public_id = 'acc-current'),
        NULL, 'Save', -100, 'FREQ=MONTHLY', NULL, 0, NULL, 'to savings', 0,
        (SELECT id FROM accounts WHERE public_id = 'acc-savings'))`,
    [T1, T2, T1, T2],
  );

  await run(
    `INSERT INTO payees (public_id, created_at, updated_at, deleted_at, name, category_id, amount)
      VALUES ('pay-1', ?, ?, NULL, 'Octopus', (SELECT id FROM categories WHERE public_id = 'cat-energy'), -88.1),
             ('pay-2', ?, ?, NULL, 'Cafe', NULL, NULL)`,
    [T1, T2, T1, T2],
  );

  await run(
    `INSERT INTO envelope_categories (public_id, created_at, updated_at, deleted_at, envelope_id, category_id)
      VALUES ('ec-1', ?, ?, NULL, (SELECT id FROM envelopes WHERE public_id = 'env-home'),
        (SELECT id FROM categories WHERE public_id = 'cat-energy'))`,
    [T1, T2],
  );
  await run(
    `INSERT INTO budget_allocations (public_id, created_at, updated_at, deleted_at, envelope_id, month, assigned)
      VALUES ('ba-1', ?, ?, NULL, (SELECT id FROM envelopes WHERE public_id = 'env-home'), '2026-03', 250.75)`,
    [T1, T2],
  );
  await run(
    `INSERT INTO budget_transfers (public_id, created_at, updated_at, deleted_at, from_envelope_id, to_envelope_id, month, amount, notes)
      VALUES ('bt-1', ?, ?, NULL, (SELECT id FROM envelopes WHERE public_id = 'env-home'),
        (SELECT id FROM envelopes WHERE public_id = 'env-fun'), '2026-03', 20, 'treat')`,
    [T1, T2],
  );

  const accountId = async (publicId: string) =>
    (
      await database.query<{ id: number }>({
        sql: "SELECT id FROM accounts WHERE public_id = ?",
        params: [publicId],
      })
    )[0]!.id;
  await run("INSERT INTO settings (id, preferences) VALUES (1, ?)", [
    JSON.stringify({
      hideReconciled: true,
      hideCleared: false,
      backupFolder: "Café",
      accountShortcuts: [
        { key: "1", accountId: await accountId("acc-current") },
        { key: "2", ctrl: true, accountId: await accountId("acc-savings") },
      ],
    }),
  ]);

  return { database, close };
};
