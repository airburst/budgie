const { eq } = require("drizzle-orm");

module.exports = function registerPayeesHandlers(ipcMain, db, schema) {
  ipcMain.handle("payees:getAll", () => db.select().from(schema.payees));

  ipcMain.handle("payees:getById", (_, id) =>
    db
      .select()
      .from(schema.payees)
      .where(eq(schema.payees.id, id))
      .then((r) => r[0] ?? null),
  );

  ipcMain.handle("payees:create", (_, data) =>
    db.insert(schema.payees).values(data).returning(),
  );

  ipcMain.handle("payees:update", (_, id, data) =>
    db
      .update(schema.payees)
      .set(data)
      .where(eq(schema.payees.id, id))
      .returning(),
  );

  ipcMain.handle("payees:delete", (_, id) =>
    db.delete(schema.payees).where(eq(schema.payees.id, id)),
  );

  // Upsert by name — called after every transaction create/update to keep
  // the payee's most-recent category and amount in sync.
  ipcMain.handle("payees:upsert", (_, name, categoryId, amount) =>
    db
      .insert(schema.payees)
      .values({ name, categoryId: categoryId ?? null, amount: amount ?? null })
      .onConflictDoUpdate({
        target: schema.payees.name,
        set: { categoryId: categoryId ?? null, amount: amount ?? null },
      })
      .returning(),
  );
};
