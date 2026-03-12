const { eq } = require("drizzle-orm");

module.exports = function registerBudgetTransfersHandlers(ipcMain, db, schema) {
  ipcMain.handle("budget_transfers:getAll", () =>
    db.select().from(schema.budgetTransfers),
  );
  ipcMain.handle("budget_transfers:getByMonth", (_, month) =>
    db
      .select()
      .from(schema.budgetTransfers)
      .where(eq(schema.budgetTransfers.month, month)),
  );
  ipcMain.handle("budget_transfers:create", (_, data) =>
    db.insert(schema.budgetTransfers).values(data).returning(),
  );
  ipcMain.handle("budget_transfers:delete", (_, id) =>
    db.delete(schema.budgetTransfers).where(eq(schema.budgetTransfers.id, id)),
  );
};
