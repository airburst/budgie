import type Database from "better-sqlite3";
import type { SqlExecutor, SqlResult } from "./executor";

/** In-memory (or file) SQLite executor for Vitest. Never imported by the Worker. */
export function createSqliteExecutor(db: Database.Database): SqlExecutor {
  return {
    batch(statements) {
      const run = db.transaction((): SqlResult[] =>
        statements.map((s) => {
          const stmt = db.prepare(s.sql);
          const params = s.params ?? [];
          if (stmt.reader) {
            return {
              rows: stmt.all(...params) as Record<string, unknown>[],
              changes: 0,
            };
          }
          return { rows: [], changes: stmt.run(...params).changes };
        }),
      );
      try {
        return Promise.resolve(run());
      } catch (error) {
        return Promise.reject(error);
      }
    },
  };
}
