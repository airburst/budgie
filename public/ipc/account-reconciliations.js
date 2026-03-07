const { eq } = require("drizzle-orm");

module.exports = function registerAccountReconciliationsHandlers(
  ipcMain,
  db,
  schema,
) {
  ipcMain.handle("account_reconciliations:getAll", () =>
    db.select().from(schema.accountReconciliations),
  );
  ipcMain.handle("account_reconciliations:getByAccount", (_, accountId) =>
    db
      .select()
      .from(schema.accountReconciliations)
      .where(eq(schema.accountReconciliations.accountId, accountId)),
  );
  ipcMain.handle("account_reconciliations:getById", (_, id) =>
    db
      .select()
      .from(schema.accountReconciliations)
      .where(eq(schema.accountReconciliations.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("account_reconciliations:create", (_, data) =>
    db.insert(schema.accountReconciliations).values(data).returning(),
  );
  ipcMain.handle("account_reconciliations:update", (_, id, data) =>
    db
      .update(schema.accountReconciliations)
      .set(data)
      .where(eq(schema.accountReconciliations.id, id))
      .returning(),
  );
  ipcMain.handle("account_reconciliations:delete", (_, id) =>
    db
      .delete(schema.accountReconciliations)
      .where(eq(schema.accountReconciliations.id, id)),
  );
};
