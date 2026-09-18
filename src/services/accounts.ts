import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import type {
  Account,
  AccountWithBalances,
  SyncMetadataFields,
} from "@/types/electron";

export type AccountCreate = Omit<
  Account,
  "id" | "createdAt" | "deleted" | SyncMetadataFields
>;
export type AccountUpdate = Partial<
  Omit<Account, "id" | "createdAt" | "deleted" | SyncMetadataFields>
>;

type AccountRow = DatabaseRow & {
  id: number;
  public_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  name: string;
  number: string | null;
  type: Account["type"];
  balance: number;
  currency: string;
  notes: string | null;
  interest_rate: number | null;
  credit_limit: number | null;
  deleted: number;
  created_at: string | null;
  pending_reconcile_balance: number | null;
  pending_reconcile_date: string | null;
  computed_balance: number;
  cleared_balance: number;
  last_reconcile_date: string | null;
  last_reconcile_balance: number | null;
};

const accountSelect = `
  SELECT
    a.id, a.name, a.number, a.type, a.balance, a.currency, a.notes,
    a.interest_rate, a.credit_limit, a.deleted, a.created_at,
    a.pending_reconcile_balance, a.pending_reconcile_date,
    COALESCE(a.balance + SUM(t.amount), a.balance) AS computed_balance,
    COALESCE(a.balance + SUM(CASE WHEN t.cleared = 1 THEN t.amount ELSE 0 END), a.balance) AS cleared_balance,
    (SELECT date FROM account_reconciliations
      WHERE account_id = a.id ORDER BY date DESC, id DESC LIMIT 1) AS last_reconcile_date,
    (SELECT balance FROM account_reconciliations
      WHERE account_id = a.id ORDER BY date DESC, id DESC LIMIT 1) AS last_reconcile_balance
  FROM accounts a
  LEFT JOIN transactions t ON t.account_id = a.id AND t.deleted_at IS NULL
`;

const mapAccount = (row: AccountRow): AccountWithBalances => ({
  id: row.id,
  publicId: row.public_id,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  name: row.name,
  number: row.number,
  type: row.type,
  balance: row.balance,
  currency: row.currency,
  notes: row.notes,
  interestRate: row.interest_rate,
  creditLimit: row.credit_limit,
  deleted: Boolean(row.deleted),
  createdAt: row.created_at,
  pendingReconcileBalance: row.pending_reconcile_balance,
  pendingReconcileDate: row.pending_reconcile_date,
  computedBalance: row.computed_balance,
  clearedBalance: row.cleared_balance,
  lastReconcileDate: row.last_reconcile_date,
  lastReconcileBalance: row.last_reconcile_balance,
});

const valueOrNull = (value: string | number | null | undefined) =>
  value === undefined ? null : value;

export type AccountService = {
  getAll(): Promise<AccountWithBalances[]>;
  getById(id: number): Promise<AccountWithBalances | null>;
  create(data: AccountCreate): Promise<Account[]>;
  update(id: number, data: AccountUpdate): Promise<Account[]>;
  delete(id: number): Promise<void>;
};

export const createAccountService = (
  database: DatabaseCapability,
): AccountService => ({
  getAll: async () => {
    const rows = await database.query<AccountRow>({
      sql: `${accountSelect} WHERE a.deleted = 0 GROUP BY a.id`,
    });
    return rows.map(mapAccount);
  },
  getById: async (id) => {
    const rows = await database.query<AccountRow>({
      sql: `${accountSelect} WHERE a.deleted = 0 AND a.id = ? GROUP BY a.id`,
      params: [id],
    });
    return rows[0] ? mapAccount(rows[0]) : null;
  },
  create: async (data) =>
    database.transaction(async (transaction) => {
      const rows = await transaction.query<Account>({
        sql: `INSERT INTO accounts
          (name, number, type, balance, currency, notes, interest_rate, credit_limit,
           deleted, pending_reconcile_balance, pending_reconcile_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?) RETURNING *`,
        params: [
          data.name,
          valueOrNull(data.number),
          data.type,
          data.balance,
          data.currency,
          valueOrNull(data.notes),
          valueOrNull(data.interestRate),
          valueOrNull(data.creditLimit),
          valueOrNull(data.pendingReconcileBalance),
          valueOrNull(data.pendingReconcileDate),
        ],
      });
      const transferParents = await transaction.query<{ id: number }>({
        sql: "SELECT id FROM categories WHERE name = 'Transfer' AND parent_id IS NULL LIMIT 1",
      });
      if (rows[0] && transferParents[0]) {
        await transaction.execute({
          sql: "INSERT INTO categories (parent_id, name, expense_type) VALUES (?, ?, 'transfer')",
          params: [transferParents[0].id, data.name],
        });
      }
      return rows;
    }),
  update: async (id, data) => {
    const fields: Array<[string, string | number | null]> = [];
    const columns: Record<keyof AccountUpdate, string> = {
      name: "name",
      number: "number",
      type: "type",
      balance: "balance",
      currency: "currency",
      notes: "notes",
      interestRate: "interest_rate",
      creditLimit: "credit_limit",
      pendingReconcileBalance: "pending_reconcile_balance",
      pendingReconcileDate: "pending_reconcile_date",
    };
    for (const [key, value] of Object.entries(data) as Array<
      [keyof AccountUpdate, string | number | null | undefined]
    >) {
      if (value !== undefined) fields.push([columns[key], valueOrNull(value)]);
    }
    if (fields.length === 0) return [];
    return database.query<Account>({
      sql: `UPDATE accounts SET ${fields.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ? RETURNING *`,
      params: [...fields.map(([, value]) => value), id],
    });
  },
  delete: async (id) =>
    database.transaction(async (transaction) => {
      const references = await transaction.query<{ id: number }>({
        sql: "SELECT id FROM transactions WHERE account_id = ? LIMIT 1",
        params: [id],
      });
      if (references[0]) {
        await transaction.execute({
          sql: "UPDATE accounts SET deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
          params: [id],
        });
      } else {
        await transaction.execute({
          sql: "UPDATE accounts SET deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
          params: [id],
        });
      }
      await transaction.execute({
        sql: "UPDATE categories SET deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE parent_id = (SELECT id FROM categories WHERE name = 'Transfer' AND parent_id IS NULL) AND name = (SELECT name FROM accounts WHERE id = ?)",
        params: [id],
      });
    }),
});
