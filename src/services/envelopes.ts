import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import type {
  Category,
  Envelope,
  EnvelopeCategory,
  SyncMetadataFields,
} from "@/types/electron";

type EnvelopeRow = DatabaseRow & {
  id: number;
  public_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  name: string;
  active: number;
  sort_order: number;
  created_at: string | null;
};
type MappingRow = DatabaseRow & {
  id: number;
  public_id: string | null;
  updated_at: string | null;
  deleted_at: string | null;
  envelope_id: number;
  category_id: number;
  created_at: string | null;
};
const mapEnvelope = (row: EnvelopeRow): Envelope => ({
  id: row.id,
  publicId: row.public_id,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  name: row.name,
  active: Boolean(row.active),
  sortOrder: row.sort_order,
  createdAt: row.created_at,
});
const mapMapping = (row: MappingRow): EnvelopeCategory => ({
  id: row.id,
  publicId: row.public_id,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
  envelopeId: row.envelope_id,
  categoryId: row.category_id,
  createdAt: row.created_at,
});

export const createEnvelopeService = (database: DatabaseCapability) => ({
  getAll: async () =>
    (
      await database.query<EnvelopeRow>({
        sql: "SELECT * FROM envelopes WHERE active = 1 AND deleted_at IS NULL ORDER BY sort_order",
      })
    ).map(mapEnvelope),
  getAllIncludingInactive: async () =>
    (
      await database.query<EnvelopeRow>({
        sql: "SELECT * FROM envelopes WHERE deleted_at IS NULL",
      })
    ).map(mapEnvelope),
  getById: async (id: number) => {
    const rows = await database.query<EnvelopeRow>({
      sql: "SELECT * FROM envelopes WHERE id = ? AND deleted_at IS NULL",
      params: [id],
    });
    return rows[0] ? mapEnvelope(rows[0]) : null;
  },
  create: async (data: Omit<Envelope, "id" | "createdAt">) =>
    (
      await database.query<EnvelopeRow>({
        sql: "INSERT INTO envelopes (name, active, sort_order) VALUES (?, ?, ?) RETURNING *",
        params: [data.name, data.active ? 1 : 0, data.sortOrder],
      })
    ).map(mapEnvelope),
  update: async (
    id: number,
    data: Partial<Omit<Envelope, "id" | "createdAt">>,
  ) => {
    const fields = Object.entries(data).filter(
      ([, value]) => value !== undefined,
    );
    const columns: Record<string, string> = {
      name: "name",
      active: "active",
      sortOrder: "sort_order",
    };
    if (fields.length === 0) return [];
    return (
      await database.query<EnvelopeRow>({
        sql: `UPDATE envelopes SET ${fields.map(([key]) => `${columns[key]} = ?`).join(", ")} WHERE id = ? RETURNING *`,
        params: [
          ...fields.map(([, value]) =>
            typeof value === "boolean" ? (value ? 1 : 0) : (value ?? null),
          ),
          id,
        ],
      })
    ).map(mapEnvelope);
  },
  delete: async (id: number) =>
    (
      await database.query<EnvelopeRow>({
        sql: "UPDATE envelopes SET active = 0 WHERE id = ? RETURNING *",
        params: [id],
      })
    ).map(mapEnvelope),
  reorder: async (updates: Array<{ id: number; sortOrder: number }>) =>
    database.transaction(async (transaction) => {
      for (const update of updates)
        await transaction.execute({
          sql: "UPDATE envelopes SET sort_order = ? WHERE id = ?",
          params: [update.sortOrder, update.id],
        });
    }),
  getCategories: async () =>
    (
      await database.query<MappingRow>({
        sql: "SELECT * FROM envelope_categories WHERE deleted_at IS NULL",
      })
    ).map(mapMapping),
  getCategoriesByEnvelope: async (envelopeId: number) =>
    (
      await database.query<MappingRow>({
        sql: "SELECT * FROM envelope_categories WHERE envelope_id = ? AND deleted_at IS NULL",
        params: [envelopeId],
      })
    ).map(mapMapping),
  createCategory: async (
    data: Omit<EnvelopeCategory, "id" | "createdAt" | SyncMetadataFields>,
  ) => {
    const category = await database.query<{
      expense_type: Category["expenseType"];
    }>({
      sql: "SELECT expense_type FROM categories WHERE id = ?",
      params: [data.categoryId],
    });
    if (!category[0]) throw new Error("Category not found");
    if (category[0].expense_type === "income")
      throw new Error("Income categories cannot be mapped to envelopes");
    const deletedMapping = await database.query<{ id: number }>({
      sql: "SELECT id FROM envelope_categories WHERE category_id = ? AND deleted_at IS NOT NULL",
      params: [data.categoryId],
    });
    if (deletedMapping[0]) {
      return (
        await database.query<MappingRow>({
          sql: "UPDATE envelope_categories SET envelope_id = ?, deleted_at = NULL WHERE id = ? RETURNING *",
          params: [data.envelopeId, deletedMapping[0].id],
        })
      ).map(mapMapping);
    }
    return (
      await database.query<MappingRow>({
        sql: "INSERT INTO envelope_categories (envelope_id, category_id) VALUES (?, ?) RETURNING *",
        params: [data.envelopeId, data.categoryId],
      })
    ).map(mapMapping);
  },
  deleteCategory: (id: number) =>
    database.execute({
      sql: "UPDATE envelope_categories SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?",
      params: [id],
    }),
  deleteCategoriesByEnvelope: (envelopeId: number) =>
    database.execute({
      sql: "UPDATE envelope_categories SET deleted_at = CURRENT_TIMESTAMP WHERE envelope_id = ?",
      params: [envelopeId],
    }),
});
