const { eq, and } = require("drizzle-orm");
const { RRule } = require("rrule");

async function processAutoPost(db, schema) {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const items = await db
    .select()
    .from(schema.scheduledTransactions)
    .where(
      and(
        eq(schema.scheduledTransactions.active, true),
        eq(schema.scheduledTransactions.autoPost, true),
      ),
    );

  for (const item of items) {
    if (!item.nextDueDate) continue;

    const daysInAdvance = item.daysInAdvance ?? 0;
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() + daysInAdvance);
    const thresholdStr = threshold.toISOString().slice(0, 10);

    // Resolve transfer metadata once per item (outside the date loop).
    let transferMeta = null;
    if (item.categoryId) {
      const category = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.id, item.categoryId))
        .then((r) => r[0] ?? null);

      if (
        category &&
        category.expenseType === "transfer" &&
        category.parentId !== null
      ) {
        const [targetAccount, sourceAccount] = await Promise.all([
          db
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.name, category.name))
            .then((r) => r[0] ?? null),
          db
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.id, item.accountId))
            .then((r) => r[0] ?? null),
        ]);

        if (targetAccount && sourceAccount) {
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

          transferMeta = {
            targetAccountId: targetAccount.id,
            counterCategoryId: counterCategory?.id ?? null,
          };
        }
      }
    }

    let nextDue = item.nextDueDate;

    while (nextDue && nextDue <= thresholdStr) {
      if (transferMeta) {
        db.transaction(() => {
          const [primary] = db
            .insert(schema.transactions)
            .values({
              accountId: item.accountId,
              categoryId: item.categoryId,
              date: nextDue,
              payee: item.payee,
              amount: item.amount,
              notes: item.notes,
              cleared: false,
              reconciled: false,
              transferTransactionId: null,
            })
            .returning()
            .all();

          const [counter] = db
            .insert(schema.transactions)
            .values({
              accountId: transferMeta.targetAccountId,
              categoryId: transferMeta.counterCategoryId,
              date: nextDue,
              payee: item.payee,
              amount: -item.amount,
              notes: item.notes ?? null,
              cleared: false,
              reconciled: false,
              transferTransactionId: primary.id,
            })
            .returning()
            .all();

          db.update(schema.transactions)
            .set({ transferTransactionId: counter.id })
            .where(eq(schema.transactions.id, primary.id))
            .run();
        });
      } else {
        await db.insert(schema.transactions).values({
          accountId: item.accountId,
          categoryId: item.categoryId,
          date: nextDue,
          payee: item.payee,
          amount: item.amount,
          notes: item.notes,
          cleared: false,
          reconciled: false,
        });
      }

      const dtstart = new Date(nextDue + "T12:00:00Z");
      const rule = new RRule({ ...RRule.parseString(item.rrule), dtstart });
      const next = rule.after(dtstart, false);
      nextDue = next ? next.toISOString().slice(0, 10) : null;
    }

    if (nextDue !== item.nextDueDate) {
      await db
        .update(schema.scheduledTransactions)
        .set({ nextDueDate: nextDue })
        .where(eq(schema.scheduledTransactions.id, item.id));
    }
  }
}

function registerScheduledTransactionsHandlers(ipcMain, db, schema) {
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
}

module.exports = registerScheduledTransactionsHandlers;
module.exports.processAutoPost = processAutoPost;
