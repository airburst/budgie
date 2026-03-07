const { eq } = require("drizzle-orm");

module.exports = function registerTransactionsHandlers(ipcMain, db, schema) {
  ipcMain.handle("transactions:getAll", () =>
    db.select().from(schema.transactions),
  );
  ipcMain.handle("transactions:getById", (_, id) =>
    db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("transactions:getByAccount", (_, accountId) =>
    db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, accountId)),
  );
  ipcMain.handle("transactions:create", (_, data) =>
    db.insert(schema.transactions).values(data).returning(),
  );
  ipcMain.handle("transactions:update", (_, id, data) =>
    db
      .update(schema.transactions)
      .set(data)
      .where(eq(schema.transactions.id, id))
      .returning(),
  );
  ipcMain.handle("transactions:delete", (_, id) =>
    db.delete(schema.transactions).where(eq(schema.transactions.id, id)),
  );
};
