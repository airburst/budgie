const { eq } = require("drizzle-orm");

module.exports = function registerEnvelopeCategoriesHandlers(
  ipcMain,
  db,
  schema,
) {
  ipcMain.handle("envelope_categories:getAll", () =>
    db.select().from(schema.envelopeCategories),
  );
  ipcMain.handle("envelope_categories:getByEnvelope", (_, envelopeId) =>
    db
      .select()
      .from(schema.envelopeCategories)
      .where(eq(schema.envelopeCategories.envelopeId, envelopeId)),
  );
  ipcMain.handle("envelope_categories:create", async (_, data) => {
    const cat = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, data.categoryId))
      .then((r) => r[0] ?? null);
    if (!cat) throw new Error("Category not found");
    if (cat.expenseType === "income") {
      throw new Error(
        "Income categories cannot be mapped to envelopes",
      );
    }
    return db.insert(schema.envelopeCategories).values(data).returning();
  });
  ipcMain.handle("envelope_categories:delete", (_, id) =>
    db
      .delete(schema.envelopeCategories)
      .where(eq(schema.envelopeCategories.id, id)),
  );
  ipcMain.handle("envelope_categories:deleteByEnvelope", (_, envelopeId) =>
    db
      .delete(schema.envelopeCategories)
      .where(eq(schema.envelopeCategories.envelopeId, envelopeId)),
  );
};
