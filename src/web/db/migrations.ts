type MigrationModule = string;
import journal from "../../main/db/migrations/meta/_journal.json";

const migrationFiles = import.meta.glob<MigrationModule>(
  "../../main/db/migrations/*.sql",
  { eager: true, import: "default", query: "?raw" },
);

export type BrowserMigration = {
  tag: string;
  sql: string;
  folderMillis: number;
};

export const browserMigrations: BrowserMigration[] = Object.entries(
  migrationFiles,
)
  .map(([path, sql]) => ({
    tag: path.slice(path.lastIndexOf("/") + 1, -4),
    sql,
    folderMillis:
      journal.entries.find(
        (entry) => entry.tag === path.slice(path.lastIndexOf("/") + 1, -4),
      )?.when ?? 0,
  }))
  .sort((left, right) => left.tag.localeCompare(right.tag));
