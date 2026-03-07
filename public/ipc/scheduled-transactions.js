const { eq } = require("drizzle-orm");

module.exports = function registerScheduledTransactionsHandlers(
  ipcMain,
  db,
  schema,
) {
  ipcMain.handle("scheduled_transactions:getAll", () =>
    db.select().from(schema.scheduledTransactions),
  );
  ipcMain.handle("scheduled_transactions:getById", (_, id) =>
    db
      .select()
      .from(schema.scheduledTransactions)
      .where(eq(schema.scheduledTransactions.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("scheduled_transactions:create", (_, data) =>
    db.insert(schema.scheduledTransactions).values(data).returning(),
  );
  ipcMain.handle("scheduled_transactions:update", (_, id, data) =>
    db
      .update(schema.scheduledTransactions)
      .set(data)
      .where(eq(schema.scheduledTransactions.id, id))
      .returning(),
  );
  ipcMain.handle("scheduled_transactions:delete", (_, id) =>
    db
      .delete(schema.scheduledTransactions)
      .where(eq(schema.scheduledTransactions.id, id)),
  );
};
