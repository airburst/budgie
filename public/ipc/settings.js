const { eq, sql } = require("drizzle-orm");

module.exports = function registerSettingsHandlers(ipcMain, db, schema) {
  ipcMain.handle("settings:getAll", () => db.select().from(schema.settings));
  ipcMain.handle("settings:getById", (_, id) =>
    db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("settings:create", (_, data) =>
    db.insert(schema.settings).values(data).returning(),
  );
  ipcMain.handle("settings:update", (_, id, data) =>
    db
      .update(schema.settings)
      .set(data)
      .where(eq(schema.settings.id, id))
      .returning(),
  );
  ipcMain.handle("settings:delete", (_, id) =>
    db.delete(schema.settings).where(eq(schema.settings.id, id)),
  );

  // Read preference keys via SQLite json_extract; returns defaults when no row exists.
  ipcMain.handle("settings:getPreferences", () =>
    db
      .select({
        hideReconciled:
          sql`COALESCE(json_extract(${schema.settings.preferences}, '$.hideReconciled'), 1)`.mapWith(
            Boolean,
          ),
        hideCleared:
          sql`COALESCE(json_extract(${schema.settings.preferences}, '$.hideCleared'), 0)`.mapWith(
            Boolean,
          ),
        autofillPayees:
          sql`COALESCE(json_extract(${schema.settings.preferences}, '$.autofillPayees'), 1)`.mapWith(
            Boolean,
          ),
        backupFolder: sql`json_extract(${schema.settings.preferences}, '$.backupFolder')`,
        backupRetentionDays:
          sql`json_extract(${schema.settings.preferences}, '$.backupRetentionDays')`.mapWith(
            Number,
          ),
        theme: sql`json_extract(${schema.settings.preferences}, '$.theme')`,
        startupPage: sql`json_extract(${schema.settings.preferences}, '$.startupPage')`,
        accountShortcuts: sql`json_extract(${schema.settings.preferences}, '$.accountShortcuts')`,
      })
      .from(schema.settings)
      .where(eq(schema.settings.id, 1))
      .then((r) => {
        const row = r[0] ?? {
          hideReconciled: true,
          hideCleared: false,
          autofillPayees: true,
          backupFolder: undefined,
          backupRetentionDays: undefined,
          theme: undefined,
          startupPage: undefined,
          accountShortcuts: undefined,
        };
        // json_extract returns null for missing keys — convert to undefined
        if (row.backupFolder === null) row.backupFolder = undefined;
        if (row.backupRetentionDays === null || isNaN(row.backupRetentionDays))
          row.backupRetentionDays = undefined;
        if (row.theme === null) row.theme = undefined;
        if (row.startupPage === null) row.startupPage = undefined;
        row.accountShortcuts = row.accountShortcuts
          ? JSON.parse(row.accountShortcuts)
          : undefined;
        return row;
      }),
  );

  // Upsert the singleton row (id=1) with the full preferences object as JSON.
  ipcMain.handle("settings:setPreferences", (_, prefs) => {
    const json = JSON.stringify(prefs);
    return db
      .insert(schema.settings)
      .values({ id: 1, preferences: json })
      .onConflictDoUpdate({
        target: schema.settings.id,
        set: { preferences: json },
      })
      .returning();
  });
};
