const { eq } = require("drizzle-orm");

module.exports = function registerCategoriesHandlers(ipcMain, db, schema) {
  ipcMain.handle("categories:getAll", () =>
    db.select().from(schema.categories),
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
  ipcMain.handle("categories:delete", (_, id) =>
    db.delete(schema.categories).where(eq(schema.categories.id, id)),
  );
};
