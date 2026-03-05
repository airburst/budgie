const { eq } = require("drizzle-orm");

module.exports = function registerAccountsHandlers(ipcMain, db, schema) {
  ipcMain.handle("accounts:getAll", () => db.select().from(schema.accounts));
  ipcMain.handle("accounts:getById", (_, id) =>
    db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("accounts:create", (_, data) =>
    db.insert(schema.accounts).values(data).returning(),
  );
  ipcMain.handle("accounts:update", (_, id, data) =>
    db
      .update(schema.accounts)
      .set(data)
      .where(eq(schema.accounts.id, id))
      .returning(),
  );
  ipcMain.handle("accounts:delete", (_, id) =>
    db.delete(schema.accounts).where(eq(schema.accounts.id, id)),
  );
};
