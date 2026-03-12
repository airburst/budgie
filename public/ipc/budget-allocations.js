const { eq, and } = require("drizzle-orm");

module.exports = function registerBudgetAllocationsHandlers(
  ipcMain,
  db,
  schema,
) {
  ipcMain.handle("budget_allocations:getAll", () =>
    db.select().from(schema.budgetAllocations),
  );
  ipcMain.handle("budget_allocations:getByMonth", (_, month) =>
    db
      .select()
      .from(schema.budgetAllocations)
      .where(eq(schema.budgetAllocations.month, month)),
  );
  ipcMain.handle(
    "budget_allocations:upsert",
    async (_, envelopeId, month, assigned) => {
      const existing = await db
        .select()
        .from(schema.budgetAllocations)
        .where(
          and(
            eq(schema.budgetAllocations.envelopeId, envelopeId),
            eq(schema.budgetAllocations.month, month),
          ),
        )
        .then((r) => r[0] ?? null);
      if (existing) {
        return db
          .update(schema.budgetAllocations)
          .set({ assigned })
          .where(eq(schema.budgetAllocations.id, existing.id))
          .returning();
      }
      return db
        .insert(schema.budgetAllocations)
        .values({ envelopeId, month, assigned })
        .returning();
    },
  );
  ipcMain.handle(
    "budget_allocations:quickFill",
    async (_, targetMonth, sourceMonth) => {
      const sourceRows = await db
        .select()
        .from(schema.budgetAllocations)
        .where(eq(schema.budgetAllocations.month, sourceMonth));
      if (sourceRows.length === 0) return [];

      const existingRows = await db
        .select()
        .from(schema.budgetAllocations)
        .where(eq(schema.budgetAllocations.month, targetMonth));
      const existingEnvelopeIds = new Set(
        existingRows.map((r) => r.envelopeId),
      );

      const activeEnvelopes = await db
        .select()
        .from(schema.envelopes)
        .where(eq(schema.envelopes.active, true));
      const activeIds = new Set(activeEnvelopes.map((e) => e.id));

      const toInsert = sourceRows
        .filter(
          (r) =>
            activeIds.has(r.envelopeId) &&
            !existingEnvelopeIds.has(r.envelopeId),
        )
        .map((r) => ({
          envelopeId: r.envelopeId,
          month: targetMonth,
          assigned: r.assigned,
        }));

      if (toInsert.length === 0) return [];
      return db.insert(schema.budgetAllocations).values(toInsert).returning();
    },
  );
  ipcMain.handle("budget_allocations:delete", (_, id) =>
    db
      .delete(schema.budgetAllocations)
      .where(eq(schema.budgetAllocations.id, id)),
  );
};
