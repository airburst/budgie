// Detects local writes in one place (SY-039): a wrapper over the database
// capability that calls `onWrite` after a statement that changes data has
// succeeded (for a transaction, after it commits).
//
// Why this cannot loop: only the handle returned here notifies. The sync
// controller and the engine are given the raw database, so everything a sync
// cycle writes (applied rows, sealed hlc, cleared dirty flags, `sync_state`)
// never reaches `onWrite`. Only application code (the services, import) uses
// the observed handle.

import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";

const WRITE = /^\s*(insert|update|delete|replace)\b/i;
const isWrite = (statement: DatabaseStatement) => WRITE.test(statement.sql);

export const observeWrites = <T extends DatabaseCapability>(
  database: T,
  onWrite: () => void,
): T => {
  const notify = () => {
    try {
      onWrite();
    } catch {
      // An observer's bug must not fail a write that succeeded.
    }
  };
  // `query` is watched too: a service may run `INSERT ... RETURNING` through it.
  const query = async <R extends DatabaseRow>(statement: DatabaseStatement) => {
    const rows = await database.query<R>(statement);
    if (isWrite(statement)) notify();
    return rows;
  };
  const execute = async (statement: DatabaseStatement) => {
    await database.execute(statement);
    if (isWrite(statement)) notify();
  };
  const transaction: DatabaseCapability["transaction"] = async (operation) => {
    let wrote = false;
    const result = await database.transaction((inner) => {
      const watched: DatabaseTransaction = {
        execute: async (statement) => {
          await inner.execute(statement);
          if (isWrite(statement)) wrote = true;
        },
        query: async <R extends DatabaseRow>(statement: DatabaseStatement) => {
          const rows = await inner.query<R>(statement);
          if (isWrite(statement)) wrote = true;
          return rows;
        },
      };
      return operation(watched);
    });
    if (wrote) notify();
    return result;
  };
  return new Proxy(database, {
    get: (target, property, receiver) => {
      if (property === "query") return query;
      if (property === "execute") return execute;
      if (property === "transaction") return transaction;
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
};
