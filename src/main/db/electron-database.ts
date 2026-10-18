import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { app } from "electron";
import path from "node:path";
import * as schema from "./schema";

const executeStatement = (
  sqlite: Database.Database,
  statement: DatabaseStatement,
) => {
  sqlite.prepare(statement.sql).run(...(statement.params ?? []));
};

const queryStatement = <T extends DatabaseRow>(
  sqlite: Database.Database,
  statement: DatabaseStatement,
) => sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as T[];

const createTransaction = (sqlite: Database.Database): DatabaseTransaction => ({
  execute: async (statement) => executeStatement(sqlite, statement),
  query: async <T extends DatabaseRow>(statement: DatabaseStatement) =>
    queryStatement<T>(sqlite, statement),
});

export function createElectronDatabase(customDbPath?: string): {
  capability: DatabaseCapability;
  sqlite: Database.Database;
  dbPath: string;
} {
  const dbPath = customDbPath ?? path.join(app.getPath("home"), "budgie.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");

  const capability: DatabaseCapability = {
    execute: async (statement) => executeStatement(sqlite, statement),
    query: async <T extends DatabaseRow>(statement: DatabaseStatement) =>
      queryStatement<T>(sqlite, statement),
    transaction: async <T>(
      operation: (transaction: DatabaseTransaction) => Promise<T>,
    ): Promise<T> => {
      sqlite.exec("BEGIN;");
      try {
        const result = await operation(createTransaction(sqlite));
        sqlite.exec("COMMIT;");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK;");
        throw error;
      }
    },
    migrate: async () => {
      const db = drizzle(sqlite, { schema });
      migrate(db, {
        migrationsFolder: path.join(app.getAppPath(), "src/main/db/migrations"),
      });
    },
    close: async () => {
      sqlite.close();
    },
  };

  return { capability, sqlite, dbPath };
}
