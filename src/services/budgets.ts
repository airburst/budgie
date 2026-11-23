import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import type { BudgetAllocation, BudgetTransfer } from "@/types/electron";

type AllocationRow = DatabaseRow & {
  id: number;
  public_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  envelope_id: number;
  month: string;
  assigned: number;
  created_at: string | null;
};
type TransferRow = DatabaseRow & {
  id: number;
  public_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  from_envelope_id: number;
  to_envelope_id: number;
  month: string;
  amount: number;
  notes: string | null;
  created_at: string | null;
};
const mapAllocation = (row: AllocationRow): BudgetAllocation => ({
  id: row.id,
  publicId: row.public_id,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  envelopeId: row.envelope_id,
  month: row.month,
  assigned: row.assigned,
  createdAt: row.created_at,
});
const mapTransfer = (row: TransferRow): BudgetTransfer => ({
  id: row.id,
  publicId: row.public_id,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
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
        sql: "SELECT * FROM budget_allocations WHERE deleted_at IS NULL",
      })
    ).map(mapAllocation),
  getAllocationsByMonth: async (month: string) =>
    (
      await database.query<AllocationRow>({
        sql: "SELECT * FROM budget_allocations WHERE month = ? AND deleted_at IS NULL",
        params: [month],
      })
    ).map(mapAllocation),
  upsertAllocation: async (
    envelopeId: number,
    month: string,
    assigned: number,
  ) => {
    // (envelope_id, month) is UNIQUE across deleted rows too, so a deleted
    // allocation is revived (keeping its public id) rather than re-inserted.
    const existing = await database.query<{ id: number }>({
      sql: "SELECT id FROM budget_allocations WHERE envelope_id = ? AND month = ?",
      params: [envelopeId, month],
    });
    if (existing[0])
      return (
        await database.query<AllocationRow>({
          sql: "UPDATE budget_allocations SET assigned = ?, deleted_at = NULL WHERE id = ? RETURNING *",
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
        sql: "SELECT * FROM budget_allocations WHERE month = ? AND deleted_at IS NULL",
        params: [sourceMonth],
      });
      const existing = await transaction.query<{
        id: number;
        envelope_id: number;
        deleted_at: string | null;
      }>({
        sql: "SELECT id, envelope_id, deleted_at FROM budget_allocations WHERE month = ?",
        params: [targetMonth],
      });
      const active = await transaction.query<{ id: number }>({
        sql: "SELECT id FROM envelopes WHERE active = 1",
      });
      const existingRows = new Map(
        existing.map((row) => [row.envelope_id, row]),
      );
      const activeIds = new Set(active.map((row) => row.id));
      const inserted: BudgetAllocation[] = [];
      for (const row of source) {
        const current = existingRows.get(row.envelope_id);
        if (!activeIds.has(row.envelope_id) || (current && !current.deleted_at))
          continue;
        // A deleted allocation still holds the UNIQUE (envelope_id, month)
        // key: revive it instead of inserting.
        const rows = await transaction.query<AllocationRow>(
          current
            ? {
                sql: "UPDATE budget_allocations SET assigned = ?, deleted_at = NULL WHERE id = ? RETURNING *",
                params: [row.assigned, current.id],
              }
            : {
                sql: "INSERT INTO budget_allocations (envelope_id, month, assigned) VALUES (?, ?, ?) RETURNING *",
                params: [row.envelope_id, targetMonth, row.assigned],
              },
        );
        if (rows[0]) inserted.push(mapAllocation(rows[0]));
      }
      return inserted;
    }),
  deleteAllocation: (id: number) =>
    database.execute({
      sql: "UPDATE budget_allocations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
      params: [id],
    }),
  getTransfers: async () =>
    (
      await database.query<TransferRow>({
        sql: "SELECT * FROM budget_transfers WHERE deleted_at IS NULL",
      })
    ).map(mapTransfer),
  getTransfersByMonth: async (month: string) =>
    (
      await database.query<TransferRow>({
        sql: "SELECT * FROM budget_transfers WHERE month = ? AND deleted_at IS NULL",
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
      sql: "UPDATE budget_transfers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
      params: [id],
    }),
});
