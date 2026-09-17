import type { DatabaseStatement } from "@/platform/database";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { migrateBrowserDatabase } from "./migrate";

type SqliteModule = Awaited<ReturnType<typeof sqlite3InitModule>>;
type SqliteDatabase = InstanceType<SqliteModule["oo1"]["DB"]>;

export type BrowserDatabaseRequest =
  | { id: number; type: "initialize"; filename?: string }
  | { id: number; type: "execute"; statement: DatabaseStatement }
  | { id: number; type: "query"; statement: DatabaseStatement }
  | { id: number; type: "begin" }
  | { id: number; type: "commit" }
  | { id: number; type: "rollback" }
  | { id: number; type: "close" };

export type BrowserDatabaseCommand = {
  [Type in BrowserDatabaseRequest["type"]]: Omit<
    Extract<BrowserDatabaseRequest, { type: Type }>,
    "id"
  >;
}[BrowserDatabaseRequest["type"]];

export type BrowserDatabaseReady = {
  id: number;
  type: "ready";
  sqliteVersion: string;
  applied: string[];
  skipped: string[];
};

export type BrowserDatabaseResponse =
  | BrowserDatabaseReady
  | { id: number; type: "result"; value?: unknown }
  | { id: number; type: "error"; message: string };

const worker = self as typeof globalThis & {
  postMessage: (message: BrowserDatabaseResponse) => void;
};

let db: SqliteDatabase | undefined;
let sqlite: SqliteModule | undefined;

const requireDatabase = () => {
  if (!db) throw new Error("Browser database is not initialized");
  return db;
};

const execute = (statement: DatabaseStatement) => {
  requireDatabase().exec({ sql: statement.sql, bind: statement.params ?? [] });
};

const query = (statement: DatabaseStatement) => {
  return requireDatabase().selectObjects(statement.sql, statement.params ?? []);
};

const initialize = async (filename: string) => {
  sqlite = await sqlite3InitModule();
  await sqlite.installOpfsSAHPoolVfs({
    name: "opfs-sahpool",
    initialCapacity: 4,
  });
  db = new sqlite.oo1.DB(`file:${filename}?vfs=opfs-sahpool`, "c");
  db.exec("PRAGMA foreign_keys = ON;");
  const migration = migrateBrowserDatabase({
    exec: (sql) => requireDatabase().exec(sql),
    selectValues: <T>(sql: string) =>
      requireDatabase().selectObjects(sql) as T[],
  });
  return {
    type: "ready" as const,
    sqliteVersion: sqlite.version.libVersion,
    ...migration,
  };
};

const respond = async (request: BrowserDatabaseRequest) => {
  switch (request.type) {
    case "initialize":
      return initialize(request.filename ?? "budgie-web.sqlite3");
    case "execute":
      execute(request.statement);
      return undefined;
    case "query":
      return query(request.statement);
    case "begin":
      execute({ sql: "BEGIN;" });
      return undefined;
    case "commit":
      execute({ sql: "COMMIT;" });
      return undefined;
    case "rollback":
      execute({ sql: "ROLLBACK;" });
      return undefined;
    case "close":
      db?.close();
      db = undefined;
      sqlite = undefined;
      return undefined;
  }
};

worker.addEventListener(
  "message",
  (event: MessageEvent<BrowserDatabaseRequest>) => {
    void respond(event.data).then(
      (value) => {
        worker.postMessage(
          event.data.type === "initialize"
            ? { id: event.data.id, ...value }
            : { id: event.data.id, type: "result", value },
        );
      },
      (error: unknown) => {
        worker.postMessage({
          id: event.data.id,
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
  },
);
