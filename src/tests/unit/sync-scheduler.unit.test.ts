// SY-039: when background sync runs. Fake timers and fake event sources.
import type {
  SyncChangeEvent,
  SyncResult,
  SyncStatusView,
} from "@/services/sync/api-types";
import {
  backoffDelay,
  createSyncScheduler,
  SYNC_BACKOFF_MAX_MS,
  SYNC_INTERVAL_MS,
  SYNC_WRITE_DEBOUNCE_MS,
  type EventSource,
} from "@/services/sync/scheduler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = () => void;

const createEvents = () => {
  const listeners = new Map<string, Set<Listener>>();
  const source: EventSource = {
    addEventListener: (type, listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
  };
  return {
    source,
    fire: (type: string) => listeners.get(type)?.forEach((l) => l()),
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
};

const status = (patch: Partial<SyncStatusView> = {}): SyncStatusView => ({
  enabled: true,
  state: "synced",
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  retryAfter: null,
  retryAt: null,
  supported: true,
  configured: true,
  consented: true,
  enrolled: true,
  started: true,
  reconciliationReview: [],
  ...patch,
});

const ok = (
  patch: Partial<SyncStatusView> = {},
): SyncResult<{
  status: SyncStatusView;
  appliedRows: number;
}> => ({ ok: true, status: status(patch), appliedRows: 0 });

const setup = (options: { locked?: boolean; enabled?: boolean } = {}) => {
  const windowEvents = createEvents();
  const documentEvents = createEvents();
  const changeListeners = new Set<(event: SyncChangeEvent) => void>();
  let locked = options.locked ?? true;
  let enabled = options.enabled ?? true;
  let inFlight = 0;
  let maxInFlight = 0;
  const syncNow = vi.fn(async (): Promise<ReturnType<typeof ok>> =>
    ok(),
  ) as ReturnType<
    typeof vi.fn<
      () => Promise<
        SyncResult<{
          status: SyncStatusView;
          appliedRows: number;
        }>
      >
    >
  >;
  const api = {
    syncNow: () => syncNow(),
    getSyncStatus: async () => status({ enabled }),
    onSyncChange: (listener: (event: SyncChangeEvent) => void) => {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };
  const scheduler = createSyncScheduler({
    api,
    hasLock: () => locked,
    windowEvents: windowEvents.source,
    documentEvents: documentEvents.source,
    isVisible: () => true,
  });
  return {
    scheduler,
    syncNow,
    windowEvents,
    documentEvents,
    setLocked: (value: boolean) => (locked = value),
    setEnabled: (value: boolean) => (enabled = value),
    emit: (state: SyncStatusView["state"]) =>
      changeListeners.forEach((l) =>
        l({ status: status({ state }), appliedRows: 0 }),
      ),
    enter: () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
    },
    leave: () => {
      inFlight -= 1;
    },
    maxInFlight: () => maxInFlight,
  };
};

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("sync scheduler triggers", () => {
  it("syncs on start", async () => {
    const t = setup();
    t.scheduler.start();
    await settle();
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    t.scheduler.stop();
  });

  it("syncs on window focus, tab visible and online", async () => {
    const t = setup();
    t.scheduler.start();
    await settle();
    t.syncNow.mockClear();

    t.windowEvents.fire("focus");
    await settle();
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    t.windowEvents.fire("online");
    await settle();
    expect(t.syncNow).toHaveBeenCalledTimes(2);
    t.documentEvents.fire("visibilitychange");
    await settle();
    expect(t.syncNow).toHaveBeenCalledTimes(3);
    t.scheduler.stop();
  });

  it("syncs every 5 minutes while open", async () => {
    const t = setup();
    t.scheduler.start();
    await settle();
    t.syncNow.mockClear();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(t.syncNow).toHaveBeenCalledTimes(2);
    t.scheduler.stop();
  });

  it("syncs about 5 seconds after a local write, debounced", async () => {
    const t = setup();
    t.scheduler.start();
    await settle();
    t.syncNow.mockClear();

    t.scheduler.notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(SYNC_WRITE_DEBOUNCE_MS - 1);
    expect(t.syncNow).not.toHaveBeenCalled();
    // A second write restarts the wait.
    t.scheduler.notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(SYNC_WRITE_DEBOUNCE_MS - 1);
    expect(t.syncNow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    t.scheduler.stop();
  });

  it("stops everything on stop()", async () => {
    const t = setup();
    t.scheduler.start();
    await settle();
    t.syncNow.mockClear();
    t.scheduler.notifyLocalWrite();
    t.scheduler.stop();
    expect(t.windowEvents.count("focus")).toBe(0);
    t.windowEvents.fire("focus");
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
    expect(t.syncNow).not.toHaveBeenCalled();
  });

  it("does nothing when sync is not enabled", async () => {
    const t = setup({ enabled: false });
    t.scheduler.start();
    t.windowEvents.fire("focus");
    t.scheduler.notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(t.syncNow).not.toHaveBeenCalled();
    t.scheduler.stop();
  });

  it("never syncs in a tab without the instance lock", async () => {
    const t = setup({ locked: false });
    t.scheduler.start();
    t.windowEvents.fire("focus");
    t.windowEvents.fire("online");
    t.scheduler.notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(t.syncNow).not.toHaveBeenCalled();
    t.setLocked(true);
    t.windowEvents.fire("focus");
    await settle();
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    t.scheduler.stop();
  });

  it("never runs two cycles at once, whatever the triggers do", async () => {
    const t = setup();
    // The controller's queue is what serialises; model it faithfully: a call
    // waits for the one before it.
    let tail: Promise<unknown> = Promise.resolve();
    t.syncNow.mockImplementation(() => {
      const run = tail.then(async () => {
        t.enter();
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        t.leave();
        return ok();
      });
      tail = run;
      return run;
    });
    t.scheduler.start();
    t.windowEvents.fire("focus");
    t.windowEvents.fire("online");
    t.scheduler.notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
    expect(t.syncNow.mock.calls.length).toBeGreaterThan(3);
    expect(t.maxInFlight()).toBe(1);
    t.scheduler.stop();
  });
});

describe("sync scheduler backoff", () => {
  it("has the documented schedule, capped", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffDelay)).toEqual([
      30_000,
      60_000,
      120_000,
      240_000,
      480_000,
      SYNC_BACKOFF_MAX_MS,
      SYNC_BACKOFF_MAX_MS,
      SYNC_BACKOFF_MAX_MS,
    ]);
  });

  it("retries a failed cycle with increasing delay and recovers", async () => {
    const t = setup();
    t.syncNow.mockResolvedValue(ok({ state: "offline" }));
    t.scheduler.start();
    await settle();
    expect(t.syncNow).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(29_999);
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.syncNow).toHaveBeenCalledTimes(2);

    // Second failure: 60 s.
    await vi.advanceTimersByTimeAsync(59_999);
    expect(t.syncNow).toHaveBeenCalledTimes(2);
    t.syncNow.mockResolvedValue(ok());
    await vi.advanceTimersByTimeAsync(1);
    expect(t.syncNow).toHaveBeenCalledTimes(3);

    // Success: no more retries until the 5-minute tick.
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS - 90_000 - 1);
    expect(t.syncNow).toHaveBeenCalledTimes(3);
    t.scheduler.stop();
  });

  it("holds write and interval triggers during backoff", async () => {
    const t = setup();
    t.syncNow.mockResolvedValue(ok({ state: "error" }));
    t.scheduler.start();
    await settle();
    t.scheduler.notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(SYNC_WRITE_DEBOUNCE_MS);
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    t.scheduler.stop();
  });

  it("online and focus reset ordinary backoff", async () => {
    const t = setup();
    t.syncNow.mockResolvedValue(ok({ state: "offline" }));
    t.scheduler.start();
    await settle();
    t.windowEvents.fire("online");
    await settle();
    expect(t.syncNow).toHaveBeenCalledTimes(2);
    t.windowEvents.fire("focus");
    await settle();
    expect(t.syncNow).toHaveBeenCalledTimes(3);
    // Backoff restarted from the first step: the retry comes after 30 s.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.syncNow).toHaveBeenCalledTimes(4);
    t.scheduler.stop();
  });

  it("honours retryAfter (daily limit) and focus does not override it", async () => {
    const t = setup();
    t.syncNow.mockResolvedValue(
      ok({ state: "daily_limit", retryAfter: 3_600 }),
    );
    t.scheduler.start();
    await settle();
    expect(t.syncNow).toHaveBeenCalledTimes(1);

    t.windowEvents.fire("focus");
    t.windowEvents.fire("online");
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 3);
    expect(t.syncNow).toHaveBeenCalledTimes(1);

    t.syncNow.mockResolvedValue(ok());
    await vi.advanceTimersByTimeAsync(45 * 60_000 - 1);
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(t.syncNow.mock.calls.length).toBeGreaterThanOrEqual(2);
    t.scheduler.stop();
  });

  it("honours retryAfter from a rate-limit refusal", async () => {
    const t = setup();
    t.syncNow.mockResolvedValue({
      ok: false,
      reason: "rate_limited",
      message: "slow down",
      retryAfter: 120,
    });
    t.scheduler.start();
    await settle();
    await vi.advanceTimersByTimeAsync(119_999);
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.syncNow).toHaveBeenCalledTimes(2);
    t.scheduler.stop();
  });

  it("does not retry clock_ahead by itself, until a status clears it", async () => {
    const t = setup();
    t.syncNow.mockResolvedValue(ok({ state: "clock_ahead" }));
    t.scheduler.start();
    await settle();
    t.windowEvents.fire("focus");
    t.scheduler.notifyLocalWrite();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);
    expect(t.syncNow).toHaveBeenCalledTimes(2); // start + the focus wake

    // The user fixes the clock and syncs manually: the status event resumes it.
    t.syncNow.mockResolvedValue(ok());
    t.emit("synced");
    t.syncNow.mockClear();
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    t.scheduler.stop();
  });

  it.each(["update_needed", "disconnected", "cloud_data_deleted"] as const)(
    "does not retry %s (sync is stopped, enabled is false)",
    async (state) => {
      const t = setup();
      t.syncNow.mockImplementation(async () => {
        t.setEnabled(false);
        return ok({ state, enabled: false });
      });
      t.scheduler.start();
      await settle();
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 3);
      t.windowEvents.fire("focus");
      t.scheduler.notifyLocalWrite();
      await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
      expect(t.syncNow).toHaveBeenCalledTimes(1);
      t.scheduler.stop();
    },
  );

  it("a manual sync result ends the backoff", async () => {
    const t = setup();
    t.syncNow.mockResolvedValue(ok({ state: "offline" }));
    t.scheduler.start();
    await settle();
    t.syncNow.mockResolvedValue(ok());
    t.emit("synced");
    await vi.advanceTimersByTimeAsync(30_000);
    // The retry timer was cancelled: nothing until the 5-minute tick.
    expect(t.syncNow).toHaveBeenCalledTimes(1);
    t.scheduler.stop();
  });
});
