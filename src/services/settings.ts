import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import type { Preferences, Settings } from "@/types/electron";

type SettingsRow = DatabaseRow & { id: number; preferences: string };

const defaults: Preferences = {
  hideReconciled: true,
  hideCleared: false,
  autofillPayees: true,
};

const parsePreferences = (value: string | undefined): Preferences => ({
  ...defaults,
  ...(value ? JSON.parse(value) : {}),
});

const mapSettings = (row: SettingsRow): Settings => ({
  id: row.id,
  preferences: row.preferences,
});

export const createSettingsService = (database: DatabaseCapability) => ({
  getAll: async () =>
    (await database.query<SettingsRow>({ sql: "SELECT * FROM settings" })).map(
      mapSettings,
    ),
  getById: async (id: number) => {
    const rows = await database.query<SettingsRow>({
      sql: "SELECT * FROM settings WHERE id = ?",
      params: [id],
    });
    return rows[0] ? mapSettings(rows[0]) : null;
  },
  create: async (data: Omit<Settings, "id">) =>
    (
      await database.query<SettingsRow>({
        sql: "INSERT INTO settings (preferences) VALUES (?) RETURNING *",
        params: [data.preferences],
      })
    ).map(mapSettings),
  update: async (id: number, data: Partial<Omit<Settings, "id">>) =>
    (
      await database.query<SettingsRow>({
        sql: "UPDATE settings SET preferences = ? WHERE id = ? RETURNING *",
        params: [data.preferences ?? "{}", id],
      })
    ).map(mapSettings),
  delete: (id: number) =>
    database.execute({
      sql: "DELETE FROM settings WHERE id = ?",
      params: [id],
    }),
  getPreferences: async () => {
    const rows = await database.query<SettingsRow>({
      sql: "SELECT preferences FROM settings WHERE id = 1",
    });
    return parsePreferences(rows[0]?.preferences);
  },
  setPreferences: async (preferences: Preferences) =>
    (
      await database.query<SettingsRow>({
        sql: `INSERT INTO settings (id, preferences) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET preferences = excluded.preferences
        RETURNING *`,
        params: [JSON.stringify(preferences)],
      })
    ).map(mapSettings),
});
