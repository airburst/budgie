const { eq } = require("drizzle-orm");

module.exports = function registerEnvelopesHandlers(ipcMain, db, schema) {
  ipcMain.handle("envelopes:getAll", () =>
    db
      .select()
      .from(schema.envelopes)
      .where(eq(schema.envelopes.active, true))
      .orderBy(schema.envelopes.sortOrder),
  );
  ipcMain.handle("envelopes:getAllIncludingInactive", () =>
    db.select().from(schema.envelopes),
  );
  ipcMain.handle("envelopes:getById", (_, id) =>
    db
      .select()
      .from(schema.envelopes)
      .where(eq(schema.envelopes.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("envelopes:create", (_, data) =>
    db.insert(schema.envelopes).values(data).returning(),
  );
  ipcMain.handle("envelopes:update", (_, id, data) =>
    db
      .update(schema.envelopes)
      .set(data)
      .where(eq(schema.envelopes.id, id))
      .returning(),
  );
  ipcMain.handle("envelopes:delete", (_, id) =>
    db
      .update(schema.envelopes)
      .set({ active: false })
      .where(eq(schema.envelopes.id, id))
      .returning(),
  );
};
