import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseValue,
} from "@/platform/database";
import type { Category } from "@/types/electron";

type CategoryRow = DatabaseRow & {
  id: number;
  public_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  parent_id: number | null;
  name: string;
  expense_type: Category["expenseType"];
  deleted: number;
  created_at: string | null;
};

const mapCategory = (row: CategoryRow): Category => ({
  id: row.id,
  publicId: row.public_id,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  parentId: row.parent_id,
  name: row.name,
  expenseType: row.expense_type,
  deleted: Boolean(row.deleted),
  createdAt: row.created_at,
});

const columns: Record<string, string> = {
  parentId: "parent_id",
  name: "name",
  expenseType: "expense_type",
  deleted: "deleted",
};

const sqliteValue = (value: unknown): DatabaseValue => {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
};

export const createCategoryService = (database: DatabaseCapability) => ({
  getAll: async () =>
    (
      await database.query<CategoryRow>({
        sql: "SELECT * FROM categories WHERE deleted = 0 AND deleted_at IS NULL",
      })
    ).map(mapCategory),
  getById: async (id: number) => {
    const rows = await database.query<CategoryRow>({
      sql: "SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL",
      params: [id],
    });
    return rows[0] ? mapCategory(rows[0]) : null;
  },
  create: async (data: Omit<Category, "id" | "createdAt" | "deleted">) =>
    (
      await database.query<CategoryRow>({
        sql: "INSERT INTO categories (parent_id, name, expense_type, deleted) VALUES (?, ?, ?, 0) RETURNING *",
        params: [data.parentId, data.name, data.expenseType],
      })
    ).map(mapCategory),
  update: async (
    id: number,
    data: Partial<Omit<Category, "id" | "createdAt" | "deleted">>,
  ) => {
    const fields = Object.entries(data).filter(
      ([key, value]) => value !== undefined && columns[key],
    );
    if (fields.length === 0) return [];
    return (
      await database.query<CategoryRow>({
        sql: `UPDATE categories SET ${fields.map(([key]) => `${columns[key]} = ?`).join(", ")} WHERE id = ? RETURNING *`,
        params: [...fields.map(([, value]) => sqliteValue(value)), id],
      })
    ).map(mapCategory);
  },
  delete: async (id: number) => {
    const category = await database.query<{ expense_type: string }>({
      sql: "SELECT expense_type FROM categories WHERE id = ?",
      params: [id],
    });
    if (category[0]?.expense_type === "transfer")
      throw new Error("Transfer categories cannot be deleted.");
    try {
      await database.execute({
        sql: "UPDATE categories SET deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
        params: [id],
      });
    } catch (error) {
      if (String(error).includes("FOREIGN KEY")) {
        await database.execute({
          sql: "UPDATE categories SET deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
          params: [id],
        });
        return;
      }
      throw error;
    }
  },
});
