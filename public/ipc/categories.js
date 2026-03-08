const { eq } = require("drizzle-orm");

module.exports = function registerCategoriesHandlers(ipcMain, db, schema) {
  ipcMain.handle("categories:getAll", () =>
    db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.deleted, false)),
  );
  ipcMain.handle("categories:getById", (_, id) =>
    db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("categories:create", (_, data) =>
    db.insert(schema.categories).values(data).returning(),
  );
  ipcMain.handle("categories:update", (_, id, data) =>
    db
      .update(schema.categories)
      .set(data)
      .where(eq(schema.categories.id, id))
      .returning(),
  );
  ipcMain.handle("categories:delete", async (_, id) => {
    const category = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, id))
      .then((r) => r[0] ?? null);
    if (category?.expenseType === "transfer") {
      throw new Error("Transfer categories cannot be deleted.");
    }
    try {
      return await db
        .delete(schema.categories)
        .where(eq(schema.categories.id, id));
    } catch (err) {
      if (err && err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        return db
          .update(schema.categories)
          .set({ deleted: true })
          .where(eq(schema.categories.id, id))
          .returning();
      }
      throw err;
    }
  });
};
