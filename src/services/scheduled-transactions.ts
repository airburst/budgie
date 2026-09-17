import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseValue,
} from "@/platform/database";
import type { ScheduledTransaction } from "@/types/electron";
import { RRule } from "rrule";
import { createTransaction } from "./transactions";

type ScheduledRow = DatabaseRow & {
  id: number;
  account_id: number;
  category_id: number | null;
  payee: string;
  amount: number;
  rrule: string;
  next_due_date: string | null;
  auto_post: number;
  days_in_advance: number | null;
  notes: string | null;
  active: number;
  transfer_to_account_id: number | null;
  created_at: string | null;
};

const mapScheduled = (row: ScheduledRow): ScheduledTransaction => ({
  id: row.id,
  accountId: row.account_id,
  categoryId: row.category_id,
  payee: row.payee,
  amount: row.amount,
  rrule: row.rrule,
  nextDueDate: row.next_due_date,
  autoPost: Boolean(row.auto_post),
  daysInAdvance: row.days_in_advance,
  notes: row.notes,
  active: Boolean(row.active),
  transferToAccountId: row.transfer_to_account_id,
  createdAt: row.created_at,
});

export type ScheduledCreate = Omit<ScheduledTransaction, "id" | "createdAt">;
export type ScheduledUpdate = Partial<
  Omit<ScheduledTransaction, "id" | "createdAt">
>;

const columns: Record<string, string> = {
  accountId: "account_id",
  categoryId: "category_id",
  payee: "payee",
  amount: "amount",
  rrule: "rrule",
  nextDueDate: "next_due_date",
  autoPost: "auto_post",
  daysInAdvance: "days_in_advance",
  notes: "notes",
  active: "active",
  transferToAccountId: "transfer_to_account_id",
};

const sqliteValue = (value: unknown): DatabaseValue => {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
};

export const createScheduledTransactionService = (
  database: DatabaseCapability,
) => ({
  getAll: async () =>
    (
      await database.query<ScheduledRow>({
        sql: "SELECT * FROM scheduled_transactions",
      })
    ).map(mapScheduled),
  getById: async (id: number) => {
    const rows = await database.query<ScheduledRow>({
      sql: "SELECT * FROM scheduled_transactions WHERE id = ?",
      params: [id],
    });
    return rows[0] ? mapScheduled(rows[0]) : null;
  },
  create: async (data: ScheduledCreate) =>
    (
      await database.query<ScheduledRow>({
        sql: `INSERT INTO scheduled_transactions
        (account_id, category_id, payee, amount, rrule, next_due_date, auto_post,
         days_in_advance, notes, active, transfer_to_account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        params: [
          data.accountId,
          data.categoryId,
          data.payee,
          data.amount,
          data.rrule,
          data.nextDueDate,
          sqliteValue(data.autoPost),
          data.daysInAdvance,
          data.notes,
          sqliteValue(data.active),
          data.transferToAccountId,
        ],
      })
    ).map(mapScheduled),
  update: async (id: number, data: ScheduledUpdate) => {
    const fields = Object.entries(data).filter(
      ([key, value]) => value !== undefined && columns[key],
    );
    if (fields.length === 0) return [];
    return (
      await database.query<ScheduledRow>({
        sql: `UPDATE scheduled_transactions SET ${fields.map(([key]) => `${columns[key]} = ?`).join(", ")} WHERE id = ? RETURNING *`,
        params: [...fields.map(([, value]) => sqliteValue(value)), id],
      })
    ).map(mapScheduled);
  },
  delete: (id: number) =>
    database.execute({
      sql: "DELETE FROM scheduled_transactions WHERE id = ?",
      params: [id],
    }),
});

export const processAutoPost = async (
  database: DatabaseCapability,
  today = new Date(),
) => {
  const items = await database.query<ScheduledRow>({
    sql: "SELECT * FROM scheduled_transactions WHERE active = 1 AND auto_post = 1",
  });
  const todayStr = today.toISOString().slice(0, 10);

  for (const row of items) {
    if (!row.next_due_date) continue;
    const daysInAdvance = row.days_in_advance ?? 0;
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() + daysInAdvance);
    const thresholdStr = threshold.toISOString().slice(0, 10);
    let nextDue: string | null = row.next_due_date;

    while (nextDue && nextDue <= thresholdStr) {
      await createTransaction(database, {
        accountId: row.account_id,
        categoryId: row.category_id,
        date: nextDue,
        payee: row.payee,
        amount: row.amount,
        notes: row.notes,
        cleared: false,
      });
      const dtstart = new Date(`${nextDue}T12:00:00Z`);
      const rule = new RRule({ ...RRule.parseString(row.rrule), dtstart });
      const next = rule.after(dtstart, false);
      nextDue = next ? next.toISOString().slice(0, 10) : null;
    }

    if (nextDue === null) {
      await database.execute({
        sql: "DELETE FROM scheduled_transactions WHERE id = ?",
        params: [row.id],
      });
    } else if (nextDue !== row.next_due_date) {
      await database.execute({
        sql: "UPDATE scheduled_transactions SET next_due_date = ? WHERE id = ?",
        params: [nextDue, row.id],
      });
    }
  }

  return todayStr;
};
