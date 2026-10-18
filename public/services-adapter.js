function createDatabaseCapability(sqlite) {
  const execute = (statement) => {
    sqlite.prepare(statement.sql).run(...(statement.params || []));
  };
  const query = (statement) =>
    sqlite.prepare(statement.sql).all(...(statement.params || []));
  const transactionHandle = {
    execute: async (statement) => execute(statement),
    query: async (statement) => query(statement),
  };
  return {
    execute: async (statement) => execute(statement),
    query: async (statement) => query(statement),
    transaction: async (operation) => {
      sqlite.exec("BEGIN;");
      try {
        const result = await operation(transactionHandle);
        sqlite.exec("COMMIT;");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK;");
        throw error;
      }
    },
    migrate: async () => {},
    close: async () => {},
  };
}

module.exports = { createDatabaseCapability };
