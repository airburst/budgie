// SY-039: with sync on and online, startup syncs before auto-post, within a
// short timeout; offline, auto-post runs as before.
import type { BrowserDatabase } from "@/web/db/browser-database";
import {
  initializeWebRuntime,
  STARTUP_SYNC_TIMEOUT_MS,
  type WebRuntimeDependencies,
} from "@/web/runtime/runtime";
import type { ApplicationAPI } from "@/types/electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = () =>
  ({
    ready: Promise.resolve({}),
    close: vi.fn(async () => undefined),
  }) as unknown as BrowserDatabase;

const setup = (
  options: {
    enabled?: boolean;
    online?: boolean;
    syncNow?: () => Promise<unknown>;
  } = {},
) => {
  const events: string[] = [];
  const syncNow = vi.fn(async () => {
    events.push("sync:start");
    const result = await (options.syncNow?.() ?? Promise.resolve());
    events.push("sync:end");
    return result;
  });
  const api = {
    getSyncStatus: async () => ({ enabled: options.enabled ?? true }),
    syncNow,
  } as unknown as ApplicationAPI;
  const scheduler = {
    start: vi.fn(() => events.push("scheduler")),
    stop: vi.fn(),
    notifyLocalWrite: vi.fn(),
  };
  const dependencies: WebRuntimeDependencies = {
    acquireLock: async () => ({ active: true, release: vi.fn() }),
    createDatabase: () => database(),
    requestPersistence: async () => "denied",
    processAutoPost: async () => {
      events.push("autopost");
    },
    createApi: () => api,
    createScheduler: () => scheduler,
    isOnline: () => options.online ?? true,
  };
  return { events, dependencies, syncNow, scheduler };
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("startup order", () => {
  it("syncs before auto-post, then starts background sync", async () => {
    const t = setup();
    await initializeWebRuntime("x", t.dependencies);
    expect(t.events).toEqual([
      "sync:start",
      "sync:end",
      "autopost",
      "scheduler",
    ]);
  });

  it("does not wait for an unreachable server beyond the timeout", async () => {
    const t = setup({ syncNow: () => new Promise(() => undefined) });
    let done = false;
    const started = initializeWebRuntime("x", t.dependencies).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(STARTUP_SYNC_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    expect(t.events).toEqual(["sync:start"]);
    await vi.advanceTimersByTimeAsync(1);
    await started;
    expect(t.events).toEqual(["sync:start", "autopost", "scheduler"]);
  });

  it("goes on when the sync call throws", async () => {
    const t = setup({
      syncNow: () => Promise.reject(new Error("network")),
    });
    await initializeWebRuntime("x", t.dependencies);
    expect(t.events).toContain("autopost");
  });

  it("offline: no startup sync, auto-post runs as today", async () => {
    const t = setup({ online: false });
    await initializeWebRuntime("x", t.dependencies);
    expect(t.syncNow).not.toHaveBeenCalled();
    expect(t.events).toEqual(["autopost", "scheduler"]);
  });

  it("sync not enabled: no startup sync", async () => {
    const t = setup({ enabled: false });
    await initializeWebRuntime("x", t.dependencies);
    expect(t.syncNow).not.toHaveBeenCalled();
    expect(t.events).toEqual(["autopost", "scheduler"]);
  });

  it("stops background sync on shutdown", async () => {
    const t = setup();
    const runtime = await initializeWebRuntime("x", t.dependencies);
    await runtime?.shutdown();
    expect(t.scheduler.stop).toHaveBeenCalledOnce();
  });
});
