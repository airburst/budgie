const { and, asc, eq, gte, inArray, lte } = require("drizzle-orm");

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
      .where(eq(schema.transactions.accountId, accountId))
      .orderBy(asc(schema.transactions.date), asc(schema.transactions.createdAt)),
  );

  ipcMain.handle(
    "transactions:getByDateRange",
    (_, startDate, endDate, accountIds) => {
      const conditions = [
        gte(schema.transactions.date, startDate),
        lte(schema.transactions.date, endDate),
      ];
      if (accountIds?.length) {
        conditions.push(inArray(schema.transactions.accountId, accountIds));
      }
      return db
        .select()
        .from(schema.transactions)
        .where(and(...conditions))
        .orderBy(asc(schema.transactions.date));
    },
  );

  ipcMain.handle("transactions:create", async (_, data) => {
    // Strip transferTransactionId if the caller included it — managed internally.
    const { transferTransactionId: _ignored, ...txData } = data;

    if (txData.categoryId) {
      const category = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.id, txData.categoryId))
        .then((r) => r[0] ?? null);

      if (
        category &&
        category.expenseType === "transfer" &&
        category.parentId !== null
      ) {
        // Find the target account (named after the selected Transfer sub-category).
        const [targetAccount, sourceAccount] = await Promise.all([
          db
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.name, category.name))
            .then((r) => r[0] ?? null),
          db
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.id, txData.accountId))
            .then((r) => r[0] ?? null),
        ]);

        if (targetAccount && sourceAccount) {
          // Find counter category: Transfer > {source account name}
          const counterCategory = await db
            .select()
            .from(schema.categories)
            .where(
              and(
                eq(schema.categories.parentId, category.parentId),
                eq(schema.categories.name, sourceAccount.name),
              ),
            )
            .then((r) => r[0] ?? null);

          return db.transaction(() => {
            const [primary] = db
              .insert(schema.transactions)
              .values({ ...txData, transferTransactionId: null })
              .returning()
              .all();

            const [counter] = db
              .insert(schema.transactions)
              .values({
                accountId: targetAccount.id,
                categoryId: counterCategory?.id ?? null,
                date: txData.date,
                payee: txData.payee,
                amount: -txData.amount,
                notes: txData.notes ?? null,
                cleared: txData.cleared ?? false,
                transferTransactionId: primary.id,
              })
              .returning()
              .all();

            db.update(schema.transactions)
              .set({ transferTransactionId: counter.id })
              .where(eq(schema.transactions.id, primary.id))
              .run();

            return [{ ...primary, transferTransactionId: counter.id }];
          });
        }
      }
    }

    return db.insert(schema.transactions).values(txData).returning();
  });

  ipcMain.handle("transactions:update", async (_, id, data) => {
    const existing = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .then((r) => r[0] ?? null);
    if (!existing) return [];
    if (existing.reconciled) {
      throw new Error(
        `Transaction ${id} is reconciled and cannot be modified.`,
      );
    }

    const updated = await db
      .update(schema.transactions)
      .set(data)
      .where(eq(schema.transactions.id, id))
      .returning();

    if (existing.transferTransactionId !== null) {
      const propagate = {};
      if (data.amount !== undefined) propagate.amount = -data.amount;
      if (data.date !== undefined) propagate.date = data.date;
      if (data.payee !== undefined) propagate.payee = data.payee;
      if (data.notes !== undefined) propagate.notes = data.notes;

      if (Object.keys(propagate).length > 0) {
        const counter = await db
          .select({ reconciled: schema.transactions.reconciled })
          .from(schema.transactions)
          .where(eq(schema.transactions.id, existing.transferTransactionId))
          .then((r) => r[0] ?? null);

        if (counter && !counter.reconciled) {
          await db
            .update(schema.transactions)
            .set(propagate)
            .where(eq(schema.transactions.id, existing.transferTransactionId));
        }
      }
    }

    return updated;
  });

  ipcMain.handle("transactions:delete", async (_, id) => {
    const existing = await db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .then((r) => r[0] ?? null);
    if (existing?.reconciled) {
      throw new Error(`Transaction ${id} is reconciled and cannot be deleted.`);
    }

    if (
      existing?.transferTransactionId !== null &&
      existing?.transferTransactionId !== undefined
    ) {
      const counterId = existing.transferTransactionId;
      return db.transaction(() => {
        // Clear both FK references so either row can be deleted.
        db.update(schema.transactions)
          .set({ transferTransactionId: null })
          .where(eq(schema.transactions.id, counterId))
          .run();
        db.update(schema.transactions)
          .set({ transferTransactionId: null })
          .where(eq(schema.transactions.id, id))
          .run();
        db.delete(schema.transactions)
          .where(eq(schema.transactions.id, counterId))
          .run();
        return db
          .delete(schema.transactions)
          .where(eq(schema.transactions.id, id))
          .run();
      });
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
