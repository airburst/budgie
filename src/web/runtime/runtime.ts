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

const requestPersistence = async (): Promise<WebRuntime["persistence"]> => {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return "unavailable";
  }
  return (await navigator.storage.persist()) ? "granted" : "denied";
};

export const initializeWebRuntime = async (
  filename = "budgie-web.sqlite3",
): Promise<WebRuntime | null> => {
  const lock: InstanceLock = await acquireInstanceLock();
  if (!lock.active) return null;

  const database = createBrowserDatabase(filename);
  await database.ready;
  const persistence = await requestPersistence();
  await processAutoPost(database);

  return {
    database,
    persistence,
    resume: async () => {
      await processAutoPost(database);
    },
    shutdown: async () => {
      await database.close();
      lock.release();
    },
  };
};
