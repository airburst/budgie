export type DatabaseValue = string | number | boolean | null | Uint8Array;

export type DatabaseRow = Record<string, DatabaseValue>;

export type DatabaseStatement = {
  sql: string;
  params?: DatabaseValue[];
};

export interface DatabaseTransaction {
  execute(statement: DatabaseStatement): Promise<void>;
  query<T extends DatabaseRow = DatabaseRow>(
    statement: DatabaseStatement,
  ): Promise<T[]>;
}

export interface DatabaseCapability {
  execute(statement: DatabaseStatement): Promise<void>;
  query<T extends DatabaseRow = DatabaseRow>(
    statement: DatabaseStatement,
  ): Promise<T[]>;
  transaction<T>(
    operation: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T>;
  migrate(): Promise<void>;
  close(): Promise<void>;
}
