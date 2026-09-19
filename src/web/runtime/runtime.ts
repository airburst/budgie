import { processAutoPost } from "@/services/scheduled-transactions";
import {
  createBrowserDatabase,
  type BrowserDatabase,
} from "@/web/db/browser-database";
import { acquireInstanceLock, type InstanceLock } from "./instance-lock";

export type WebRuntime = {
  database: BrowserDatabase;
  persistence: "granted" | "denied" | "unavailable";
  resume: () => Promise<void>;
  shutdown: () => Promise<void>;
};

export type WebRuntimeDependencies = {
  acquireLock: () => Promise<InstanceLock>;
  createDatabase: (filename: string) => BrowserDatabase;
  requestPersistence: () => Promise<WebRuntime["persistence"]>;
  processAutoPost: (database: BrowserDatabase) => Promise<void>;
};

export const requestBrowserPersistence = async (): Promise<
  WebRuntime["persistence"]
> => {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return "unavailable";
  }
  return (await navigator.storage.persist()) ? "granted" : "denied";
};

const defaultDependencies: WebRuntimeDependencies = {
  acquireLock: () => acquireInstanceLock(),
  createDatabase: (filename) => createBrowserDatabase(filename),
  requestPersistence: requestBrowserPersistence,
  processAutoPost: async (database) => {
    await processAutoPost(database);
  },
};

export const initializeWebRuntime = async (
  filename = "budgie-web.sqlite3",
  dependencies: WebRuntimeDependencies = defaultDependencies,
): Promise<WebRuntime | null> => {
  const lock: InstanceLock = await dependencies.acquireLock();
  if (!lock.active) return null;

  const database = dependencies.createDatabase(filename);
  try {
    await database.ready;
  } catch (error) {
    try {
      await database.close();
    } finally {
      lock.release();
    }
    throw error;
  }
  const persistence = await dependencies.requestPersistence();
  await dependencies.processAutoPost(database);

  return {
    database,
    persistence,
    resume: async () => {
      await dependencies.processAutoPost(database);
    },
    shutdown: async () => {
      await database.close();
      lock.release();
    },
  };
};
