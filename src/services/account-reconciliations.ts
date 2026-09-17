import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import type { AccountReconciliation } from "@/types/electron";

type ReconciliationRow = DatabaseRow & {
  id: number;
  account_id: number;
  date: string;
  balance: number;
  notes: string | null;
  created_at: string | null;
};
const map = (row: ReconciliationRow): AccountReconciliation => ({
  id: row.id,
  accountId: row.account_id,
  date: row.date,
  balance: row.balance,
  notes: row.notes,
  createdAt: row.created_at,
});

export const createAccountReconciliationService = (
  database: DatabaseCapability,
) => ({
  getAll: async () =>
    (
      await database.query<ReconciliationRow>({
        sql: "SELECT * FROM account_reconciliations",
      })
    ).map(map),
  getByAccount: async (accountId: number) =>
    (
      await database.query<ReconciliationRow>({
        sql: "SELECT * FROM account_reconciliations WHERE account_id = ?",
        params: [accountId],
      })
    ).map(map),
  getById: async (id: number) => {
    const rows = await database.query<ReconciliationRow>({
      sql: "SELECT * FROM account_reconciliations WHERE id = ?",
      params: [id],
    });
    return rows[0] ? map(rows[0]) : null;
  },
  create: async (data: Omit<AccountReconciliation, "id" | "createdAt">) =>
    (
      await database.query<ReconciliationRow>({
        sql: "INSERT INTO account_reconciliations (account_id, date, balance, notes) VALUES (?, ?, ?, ?) RETURNING *",
        params: [data.accountId, data.date, data.balance, data.notes],
      })
    ).map(map),
  update: async (
    id: number,
    data: Partial<Omit<AccountReconciliation, "id" | "createdAt">>,
  ) => {
    const columns: Record<string, string> = {
      accountId: "account_id",
      date: "date",
      balance: "balance",
      notes: "notes",
    };
    const fields = Object.entries(data).filter(
      ([key, value]) => value !== undefined && columns[key],
    );
    if (fields.length === 0) return [];
    return (
      await database.query<ReconciliationRow>({
        sql: `UPDATE account_reconciliations SET ${fields.map(([key]) => `${columns[key]} = ?`).join(", ")} WHERE id = ? RETURNING *`,
        params: [...fields.map(([, value]) => value ?? null), id],
      })
    ).map(map);
  },
  delete: (id: number) =>
    database.execute({
      sql: "DELETE FROM account_reconciliations WHERE id = ?",
      params: [id],
    }),
});
