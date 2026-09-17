import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import type { Payee } from "@/types/electron";

export type PayeeCreate = Omit<Payee, "id" | "createdAt">;
export type PayeeUpdate = Partial<Omit<Payee, "id" | "createdAt">>;

type PayeeRow = DatabaseRow & {
  id: number;
  name: string;
  category_id: number | null;
  amount: number | null;
  created_at: string | null;
};

const mapPayee = (row: PayeeRow): Payee => ({
  id: row.id,
  name: row.name,
  categoryId: row.category_id,
  amount: row.amount,
  createdAt: row.created_at,
});

export const createPayeeService = (database: DatabaseCapability) => ({
  getAll: async () =>
    (await database.query<PayeeRow>({ sql: "SELECT * FROM payees" })).map(
      mapPayee,
    ),
  getById: async (id: number) => {
    const rows = await database.query<PayeeRow>({
      sql: "SELECT * FROM payees WHERE id = ?",
      params: [id],
    });
    return rows[0] ? mapPayee(rows[0]) : null;
  },
  create: async (data: PayeeCreate) =>
    (
      await database.query<PayeeRow>({
        sql: "INSERT INTO payees (name, category_id, amount) VALUES (?, ?, ?) RETURNING *",
        params: [data.name, data.categoryId, data.amount],
      })
    ).map(mapPayee),
  update: async (id: number, data: PayeeUpdate) => {
    const fields = Object.entries(data).filter(
      ([, value]) => value !== undefined,
    );
    if (fields.length === 0) return [];
    const columns: Record<string, string> = {
      name: "name",
      categoryId: "category_id",
      amount: "amount",
    };
    return (
      await database.query<PayeeRow>({
        sql: `UPDATE payees SET ${fields.map(([key]) => `${columns[key]} = ?`).join(", ")} WHERE id = ? RETURNING *`,
        params: [...fields.map(([, value]) => value ?? null), id],
      })
    ).map(mapPayee);
  },
  delete: (id: number) =>
    database.execute({ sql: "DELETE FROM payees WHERE id = ?", params: [id] }),
  upsert: async (
    name: string,
    categoryId: number | null,
    amount: number | null,
  ) =>
    (
      await database.query<PayeeRow>({
        sql: `INSERT INTO payees (name, category_id, amount) VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET category_id = excluded.category_id, amount = excluded.amount
        RETURNING *`,
        params: [name, categoryId, amount],
      })
    ).map(mapPayee),
});
