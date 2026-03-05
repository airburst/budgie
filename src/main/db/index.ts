import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { app } from "electron";
import path from "path";
import * as schema from "./schema";

// 1. Determine the persistent storage path
const dbPath = path.join(app.getPath("home"), "app_database.db");

// 2. Initialize better-sqlite3
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// 3. Initialize Drizzle
export const db = drizzle(sqlite, { schema });
export { schema };

// 4. Run migrations on startup
export function setupDatabase() {
  // 'migrations' folder must be bundled with your app
  const migrationsPath = path.join(app.getAppPath(), "src/main/db/migrations");

  try {
    migrate(db, { migrationsFolder: migrationsPath });
    console.log("Migrations applied successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  }
}
