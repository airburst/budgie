import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { migrateBrowserDatabase } from "./migrate";

type WorkerRequest = {
  type: "initialize";
  filename?: string;
};

export type BrowserDatabaseReady = {
  type: "ready";
  sqliteVersion: string;
  applied: string[];
  skipped: string[];
};

export type BrowserDatabaseResponse =
  BrowserDatabaseReady | { type: "error"; message: string };

const worker = self as typeof globalThis & {
  postMessage: (message: BrowserDatabaseResponse) => void;
};

const initialize = async (filename: string) => {
  const sqlite = await sqlite3InitModule();
  await sqlite.installOpfsSAHPoolVfs({
    name: "opfs-sahpool",
    initialCapacity: 4,
  });
  const db = new sqlite.oo1.DB(`file:${filename}?vfs=opfs-sahpool`, "c");

  try {
    db.exec("PRAGMA foreign_keys = ON;");
    const migration = migrateBrowserDatabase({
      exec: (sql) => db.exec(sql),
      selectValues: <T>(sql: string) => db.selectObjects(sql) as T[],
    });
    worker.postMessage({
      type: "ready",
      sqliteVersion: sqlite.version.libVersion,
      ...migration,
    } satisfies BrowserDatabaseReady);
  } finally {
    db.close();
  }
};

worker.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "initialize") return;
  void initialize(event.data.filename ?? "budgie-web.sqlite3").catch(
    (error) => {
      worker.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    },
  );
});
