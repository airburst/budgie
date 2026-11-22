import type { SqlExecutor, SqlResult, SqlStatement } from "./executor";

/** The slice of the Cloudflare D1 binding this project uses. */
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
}
export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedLike;
  batch(statements: D1PreparedLike[]): Promise<
    {
      results?: Record<string, unknown>[];
      meta?: { changes?: number };
    }[]
  >;
}

export function createD1Executor(db: D1DatabaseLike): SqlExecutor {
  return {
    async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
      if (statements.length === 0) return [];
      const prepared = statements.map((s) =>
        db.prepare(s.sql).bind(...(s.params ?? [])),
      );
      const out = await db.batch(prepared);
      return out.map((r) => ({
        rows: r.results ?? [],
        changes: r.meta?.changes ?? 0,
      }));
    },
  };
}
