const { eq, inArray } = require("drizzle-orm");

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
  ipcMain.handle("transactions:update", async (_, id, data) => {
    const existing = await db
      .select({ reconciled: schema.transactions.reconciled })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .then((r) => r[0] ?? null);
    if (!existing) return [];
    if (existing.reconciled) {
      throw new Error(
        `Transaction ${id} is reconciled and cannot be modified.`,
      );
    }
    return db
      .update(schema.transactions)
      .set(data)
      .where(eq(schema.transactions.id, id))
      .returning();
  });
  ipcMain.handle("transactions:delete", async (_, id) => {
    const existing = await db
      .select({ reconciled: schema.transactions.reconciled })
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .then((r) => r[0] ?? null);
    if (existing?.reconciled) {
      throw new Error(
        `Transaction ${id} is reconciled and cannot be deleted.`,
      );
    }
    return db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  });
  ipcMain.handle(
    "transactions:reconcile",
    (_, { toReconcile, toUnclear, checkpoint }) => {
      return db.transaction(() => {
        if (toReconcile.length > 0) {
          db.update(schema.transactions)
            .set({ cleared: true, reconciled: true })
            .where(inArray(schema.transactions.id, toReconcile))
            .run();
        }
        if (toUnclear.length > 0) {
          db.update(schema.transactions)
            .set({ cleared: false, reconciled: false })
            .where(inArray(schema.transactions.id, toUnclear))
            .run();
        }
        return db
          .insert(schema.accountReconciliations)
          .values(checkpoint)
          .returning()
          .all();
      });
    },
  );
};
