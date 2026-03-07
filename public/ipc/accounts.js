const { eq, sql } = require("drizzle-orm");

function withBalances(db, schema) {
  return db
    .select({
      id: schema.accounts.id,
      name: schema.accounts.name,
      number: schema.accounts.number,
      type: schema.accounts.type,
      balance: schema.accounts.balance,
      currency: schema.accounts.currency,
      notes: schema.accounts.notes,
      createdAt: schema.accounts.createdAt,
      computedBalance: sql`COALESCE(
        ${schema.accounts.balance} + SUM(${schema.transactions.amount}),
        ${schema.accounts.balance}
      )`.mapWith(Number),
      clearedBalance: sql`COALESCE(
        ${schema.accounts.balance} + SUM(
          CASE WHEN ${schema.transactions.cleared} = 1
          THEN ${schema.transactions.amount} ELSE 0 END
        ),
        ${schema.accounts.balance}
      )`.mapWith(Number),
      lastReconcileDate: sql`(
        SELECT "date" FROM "account_reconciliations"
        WHERE "account_id" = ${schema.accounts.id}
        ORDER BY "date" DESC LIMIT 1
      )`,
      lastReconcileBalance: sql`(
        SELECT "balance" FROM "account_reconciliations"
        WHERE "account_id" = ${schema.accounts.id}
        ORDER BY "date" DESC LIMIT 1
      )`.mapWith(Number),
    })
    .from(schema.accounts)
    .leftJoin(
      schema.transactions,
      eq(schema.transactions.accountId, schema.accounts.id),
    )
    .groupBy(schema.accounts.id);
}

module.exports = function registerAccountsHandlers(ipcMain, db, schema) {
  ipcMain.handle("accounts:getAll", () => withBalances(db, schema));
  ipcMain.handle("accounts:getById", (_, id) =>
    withBalances(db, schema)
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
