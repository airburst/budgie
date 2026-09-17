import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import type { BudgetAllocation, BudgetTransfer } from "@/types/electron";

type AllocationRow = DatabaseRow & {
  id: number;
  envelope_id: number;
  month: string;
  assigned: number;
  created_at: string | null;
};
type TransferRow = DatabaseRow & {
  id: number;
  from_envelope_id: number;
  to_envelope_id: number;
  month: string;
  amount: number;
  notes: string | null;
  created_at: string | null;
};
const mapAllocation = (row: AllocationRow): BudgetAllocation => ({
  id: row.id,
  envelopeId: row.envelope_id,
  month: row.month,
  assigned: row.assigned,
  createdAt: row.created_at,
});
const mapTransfer = (row: TransferRow): BudgetTransfer => ({
  id: row.id,
  fromEnvelopeId: row.from_envelope_id,
  toEnvelopeId: row.to_envelope_id,
  month: row.month,
  amount: row.amount,
  notes: row.notes,
  createdAt: row.created_at,
});

export const createBudgetService = (database: DatabaseCapability) => ({
  getAllocations: async () =>
    (
      await database.query<AllocationRow>({
        sql: "SELECT * FROM budget_allocations",
      })
    ).map(mapAllocation),
  getAllocationsByMonth: async (month: string) =>
    (
      await database.query<AllocationRow>({
        sql: "SELECT * FROM budget_allocations WHERE month = ?",
        params: [month],
      })
    ).map(mapAllocation),
  upsertAllocation: async (
    envelopeId: number,
    month: string,
    assigned: number,
  ) => {
    const existing = await database.query<{ id: number }>({
      sql: "SELECT id FROM budget_allocations WHERE envelope_id = ? AND month = ?",
      params: [envelopeId, month],
    });
    if (existing[0])
      return (
        await database.query<AllocationRow>({
          sql: "UPDATE budget_allocations SET assigned = ? WHERE id = ? RETURNING *",
          params: [assigned, existing[0].id],
        })
      ).map(mapAllocation);
    return (
      await database.query<AllocationRow>({
        sql: "INSERT INTO budget_allocations (envelope_id, month, assigned) VALUES (?, ?, ?) RETURNING *",
        params: [envelopeId, month, assigned],
      })
    ).map(mapAllocation);
  },
  quickFillAllocations: async (targetMonth: string, sourceMonth: string) =>
    database.transaction(async (transaction) => {
      const source = await transaction.query<AllocationRow>({
        sql: "SELECT * FROM budget_allocations WHERE month = ?",
        params: [sourceMonth],
      });
      const existing = await transaction.query<{ envelope_id: number }>({
        sql: "SELECT envelope_id FROM budget_allocations WHERE month = ?",
        params: [targetMonth],
      });
      const active = await transaction.query<{ id: number }>({
        sql: "SELECT id FROM envelopes WHERE active = 1",
      });
      const existingIds = new Set(existing.map((row) => row.envelope_id));
      const activeIds = new Set(active.map((row) => row.id));
      const inserted: BudgetAllocation[] = [];
      for (const row of source) {
        if (!activeIds.has(row.envelope_id) || existingIds.has(row.envelope_id))
          continue;
        const rows = await transaction.query<AllocationRow>({
          sql: "INSERT INTO budget_allocations (envelope_id, month, assigned) VALUES (?, ?, ?) RETURNING *",
          params: [row.envelope_id, targetMonth, row.assigned],
        });
        if (rows[0]) inserted.push(mapAllocation(rows[0]));
      }
      return inserted;
    }),
  deleteAllocation: (id: number) =>
    database.execute({
      sql: "DELETE FROM budget_allocations WHERE id = ?",
      params: [id],
    }),
  getTransfers: async () =>
    (
      await database.query<TransferRow>({
        sql: "SELECT * FROM budget_transfers",
      })
    ).map(mapTransfer),
  getTransfersByMonth: async (month: string) =>
    (
      await database.query<TransferRow>({
        sql: "SELECT * FROM budget_transfers WHERE month = ?",
        params: [month],
      })
    ).map(mapTransfer),
  createTransfer: async (data: Omit<BudgetTransfer, "id" | "createdAt">) =>
    (
      await database.query<TransferRow>({
        sql: "INSERT INTO budget_transfers (from_envelope_id, to_envelope_id, month, amount, notes) VALUES (?, ?, ?, ?, ?) RETURNING *",
        params: [
          data.fromEnvelopeId,
          data.toEnvelopeId,
          data.month,
          data.amount,
          data.notes,
        ],
      })
    ).map(mapTransfer),
  deleteTransfer: (id: number) =>
    database.execute({
      sql: "DELETE FROM budget_transfers WHERE id = ?",
      params: [id],
    }),
});
