const { and, eq, isNull, sql } = require("drizzle-orm");

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
      interestRate: schema.accounts.interestRate,
      creditLimit: schema.accounts.creditLimit,
      deleted: schema.accounts.deleted,
      createdAt: schema.accounts.createdAt,
      pendingReconcileBalance: schema.accounts.pendingReconcileBalance,
      pendingReconcileDate: schema.accounts.pendingReconcileDate,
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
    .where(eq(schema.accounts.deleted, false))
    .leftJoin(
      schema.transactions,
      eq(schema.transactions.accountId, schema.accounts.id),
    )
    .groupBy(schema.accounts.id);
}

async function findTransferParent(db, schema) {
  return db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.name, "Transfer"),
        isNull(schema.categories.parentId),
      ),
    )
    .then((r) => r[0] ?? null);
}

module.exports = function registerAccountsHandlers(ipcMain, db, schema) {
  ipcMain.handle("accounts:getAll", () => withBalances(db, schema));
  ipcMain.handle("accounts:getById", (_, id) =>
    withBalances(db, schema)
      .where(eq(schema.accounts.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("accounts:create", async (_, data) => {
    const [account] = await db.insert(schema.accounts).values(data).returning();
    const transferParent = await findTransferParent(db, schema);
    if (transferParent) {
      await db.insert(schema.categories).values({
        parentId: transferParent.id,
        name: account.name,
        expenseType: "transfer",
      });
    }
    return [account];
  });
  ipcMain.handle("accounts:update", (_, id, data) =>
    db
      .update(schema.accounts)
      .set(data)
      .where(eq(schema.accounts.id, id))
      .returning(),
  );
  ipcMain.handle("accounts:delete", async (_, id) => {
    const account = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, id))
      .then((r) => r[0] ?? null);
    if (account) {
      const transferParent = await findTransferParent(db, schema);
      if (transferParent) {
        await db
          .update(schema.categories)
          .set({ deleted: true })
          .where(
            and(
              eq(schema.categories.parentId, transferParent.id),
              eq(schema.categories.name, account.name),
            ),
          );
      }
    }
    try {
      // Try hard delete first (works if no FK constraints)
      return await db.delete(schema.accounts).where(eq(schema.accounts.id, id));
    } catch (err) {
      // If FK constraint blocks deletion, soft delete instead
      if (err && err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
        return db
          .update(schema.accounts)
          .set({ deleted: true })
          .where(eq(schema.accounts.id, id))
          .returning();
      }
      throw err;
    }
  });
};
