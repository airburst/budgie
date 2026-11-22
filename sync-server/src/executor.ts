export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}

export interface SqlResult {
  /** Rows returned by a SELECT or RETURNING; empty for plain writes. */
  rows: Record<string, unknown>[];
  /** Rows written by an INSERT, UPDATE or DELETE. */
  changes: number;
}

/**
 * Batch-shaped SQL executor. D1 has no read-then-write transactions, only
 * `batch()`, so this is the only way to run SQL: the statements run in order
 * as one transaction (all or nothing) and one result comes back per statement.
 * Rejects if any statement fails, having changed nothing.
 */
export interface SqlExecutor {
  batch(statements: SqlStatement[]): Promise<SqlResult[]>;
}
