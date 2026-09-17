import type { DatabaseCapability } from "@/platform/database";
import type { AccountReconciliation } from "@/types/electron";

export type ReconcilePayload = {
  toReconcile: number[];
  toUnclear: number[];
  checkpoint: Omit<AccountReconciliation, "id" | "createdAt">;
};

const placeholders = (values: number[]) => values.map(() => "?").join(", ");

export const reconcileTransactions = async (
  database: DatabaseCapability,
  payload: ReconcilePayload,
): Promise<AccountReconciliation[]> =>
  database.transaction(async (transaction) => {
    if (payload.toReconcile.length > 0) {
      await transaction.execute({
        sql: `UPDATE transactions SET cleared = 1, reconciled = 1 WHERE id IN (${placeholders(payload.toReconcile)})`,
        params: payload.toReconcile,
      });
    }
    if (payload.toUnclear.length > 0) {
      await transaction.execute({
        sql: `UPDATE transactions SET cleared = 0, reconciled = 0 WHERE id IN (${placeholders(payload.toUnclear)})`,
        params: payload.toUnclear,
      });
    }
    const rows = await transaction.query<{
      id: number;
      account_id: number;
      date: string;
      balance: number;
      notes: string | null;
      created_at: string | null;
    }>({
      sql: `INSERT INTO account_reconciliations
        (account_id, date, balance, notes) VALUES (?, ?, ?, ?) RETURNING *`,
      params: [
        payload.checkpoint.accountId,
        payload.checkpoint.date,
        payload.checkpoint.balance,
        payload.checkpoint.notes,
      ],
    });
    return rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      date: row.date,
      balance: row.balance,
      notes: row.notes,
      createdAt: row.created_at,
    }));
  });

export const createReconciliationService = (database: DatabaseCapability) => ({
  reconcile: (payload: ReconcilePayload) =>
    reconcileTransactions(database, payload),
});

export type ReconciliationService = ReturnType<
  typeof createReconciliationService
>;
