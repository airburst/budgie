import {
  createBrowserApplicationApi,
  type BrowserApiOptions,
} from "@/platform/browser-api";
import { processAutoPost } from "@/services/scheduled-transactions";
import {
  createSyncScheduler,
  type SyncScheduler,
  type SyncSchedulerDeps,
} from "@/services/sync/scheduler";
import type { ApplicationAPI } from "@/types/electron";
import {
  createBrowserDatabase,
  type BrowserDatabase,
} from "@/web/db/browser-database";
import { acquireInstanceLock, type InstanceLock } from "./instance-lock";

export type WebRuntime = {
  database: BrowserDatabase;
  /** The application API over `database`; null when no `createApi` was given. */
  api: ApplicationAPI | null;
  persistence: "granted" | "denied" | "unavailable";
  /** True while this tab holds the instance lock (until `shutdown`). */
  isActive: () => boolean;
  resume: () => Promise<void>;
  shutdown: () => Promise<void>;
};

export type WebRuntimeDependencies = {
  acquireLock: () => Promise<InstanceLock>;
  createDatabase: (filename: string) => BrowserDatabase;
  requestPersistence: () => Promise<WebRuntime["persistence"]>;
  processAutoPost: (database: BrowserDatabase) => Promise<void>;
  /**
   * Builds the application API (one per runtime, so there is one sync queue).
   * Without it the runtime has no API, no startup sync and no background sync.
   */
  createApi?: (
    database: BrowserDatabase,
    options: Pick<BrowserApiOptions, "hasLock" | "onLocalWrite">,
  ) => ApplicationAPI;
  createScheduler?: (
    deps: Pick<SyncSchedulerDeps, "api" | "hasLock">,
  ) => SyncScheduler;
  isOnline?: () => boolean;
  /** How long startup waits for the first sync; default `STARTUP_SYNC_TIMEOUT_MS`. */
  startupSyncTimeoutMs?: number;
};

/** Startup waits at most this long for sync before auto-posting anyway. */
export const STARTUP_SYNC_TIMEOUT_MS = 3_000;

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
  createApi: (database, options) =>
    createBrowserApplicationApi(database, options),
  createScheduler: (deps) =>
    createSyncScheduler({
      ...deps,
      windowEvents: window,
      documentEvents: document,
      isVisible: () => document.visibilityState === "visible",
    }),
  isOnline: () => typeof navigator === "undefined" || navigator.onLine,
};

/**
 * Runs one sync before auto-post, when sync is on and the device is online.
 * Never throws and never waits longer than the timeout: an unreachable server
 * must not block startup. A cycle that outlives the timeout keeps running
 * (the controller queues it); the scheduler's start trigger syncs again after.
 */
const syncBeforeAutoPost = async (
  api: ApplicationAPI,
  dependencies: WebRuntimeDependencies,
): Promise<void> => {
  if (!(dependencies.isOnline?.() ?? true)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const cycle = (async () => {
      const status = await api.getSyncStatus();
      if (status.enabled) await api.syncNow();
    })();
    await Promise.race([
      cycle,
      new Promise<void>((resolve) => {
        timer = setTimeout(
          resolve,
          dependencies.startupSyncTimeoutMs ?? STARTUP_SYNC_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    // Sync trouble never stops the app from starting.
  } finally {
    clearTimeout(timer);
  }
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

  let closed = false;
  let scheduler: SyncScheduler | null = null;
  const api =
    dependencies.createApi?.(database, {
      hasLock: () => !closed,
      onLocalWrite: () => scheduler?.notifyLocalWrite(),
    }) ?? null;

  // Order matters: sync first, so that a scheduled transaction another device
  // has already posted arrives before we look at what is due. Auto-post ids
  // are deterministic (SPEC 8.9), so a late sync is still safe (two devices
  // posting the same occurrence end up with one transaction), but syncing
  // first avoids posting what is already posted.
  if (api) await syncBeforeAutoPost(api, dependencies);
  await dependencies.processAutoPost(database);
  if (api && dependencies.createScheduler) {
    // Starts with a cycle, which also pushes whatever auto-post just wrote.
    scheduler = dependencies.createScheduler({ api, hasLock: () => !closed });
    scheduler.start();
  }

  return {
    database,
    api,
    persistence,
    isActive: () => !closed,
    resume: async () => {
      await dependencies.processAutoPost(database);
    },
    shutdown: async () => {
      closed = true;
      scheduler?.stop();
      await database.close();
      lock.release();
    },
  };
};
