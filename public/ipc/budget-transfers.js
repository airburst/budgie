const { and, eq, isNull } = require("drizzle-orm");

module.exports = function registerBudgetTransfersHandlers(ipcMain, db, schema) {
  ipcMain.handle("budget_transfers:getAll", () =>
    db
      .select()
      .from(schema.budgetTransfers)
      .where(isNull(schema.budgetTransfers.deletedAt)),
  );
  ipcMain.handle("budget_transfers:getByMonth", (_, month) =>
    db
      .select()
      .from(schema.budgetTransfers)
      .where(
        and(
          eq(schema.budgetTransfers.month, month),
          isNull(schema.budgetTransfers.deletedAt),
        ),
      ),
  );
  ipcMain.handle("budget_transfers:create", (_, data) =>
    db.insert(schema.budgetTransfers).values(data).returning(),
  );
  ipcMain.handle("budget_transfers:delete", (_, id) =>
    db
      .update(schema.budgetTransfers)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.budgetTransfers.id, id)),
  );
};
