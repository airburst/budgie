// Background sync (SY-039): decides WHEN to call `syncNow`, nothing else.
//
// Triggers: app start (`start()`), window focus / tab visible, the `online`
// event, about 5 s after a local write (debounced), and every 5 minutes.
//
// One cycle at a time is the controller's job (`syncNow` queues and shares a
// waiting cycle); the scheduler has no lock of its own and may call `syncNow`
// as often as it likes.
//
// Does nothing when this tab lacks the instance lock or sync is not enabled
// (`getSyncStatus().enabled`; the stopping states clear it, so `update_needed`,
// `disconnected` and `cloud_data_deleted` are never retried by themselves).
//
// Backoff, after a cycle whose status is `offline` or `error`:
//   delay = min(30 s * 2^(failures - 1), 15 min)
//   -> 30 s, 1 m, 2 m, 4 m, 8 m, 15 m, 15 m...
// If the status carries `retryAfter` (daily limit, rate limit) the retry waits
// that long instead (never less than the backoff step). Until the retry time,
// write, interval and start triggers do nothing. `online` and focus reset the
// ordinary network backoff (not a server `retryAfter`). `clock_ahead` is not
// retried at all until a later status (a manual sync) shows it cleared.
// A manual `syncNow` from the UI never goes through here and always works.

import type { SyncApi } from "@/services/sync/api-types";

export const SYNC_WRITE_DEBOUNCE_MS = 5_000;
export const SYNC_INTERVAL_MS = 5 * 60_000;
export const SYNC_BACKOFF_BASE_MS = 30_000;
export const SYNC_BACKOFF_MAX_MS = 15 * 60_000;

export type EventSource = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

export type SyncSchedulerDeps = {
  api: Pick<SyncApi, "syncNow" | "getSyncStatus" | "onSyncChange">;
  /** True while this tab holds the instance lock. */
  hasLock: () => boolean;
  /** `window`: `focus` and `online`. */
  windowEvents?: EventSource;
  /** `document`: `visibilitychange`. */
  documentEvents?: EventSource;
  isVisible?: () => boolean;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type SyncScheduler = {
  /** Attaches the event sources and timers, then runs the start trigger. */
  start: () => void;
  stop: () => void;
  /** Call after a local write (see `observeWrites`). */
  notifyLocalWrite: () => void;
};

export const backoffDelay = (failures: number): number =>
  Math.min(
    SYNC_BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1),
    SYNC_BACKOFF_MAX_MS,
  );

export const createSyncScheduler = (deps: SyncSchedulerDeps): SyncScheduler => {
  const now = deps.now ?? Date.now;
  const setTimer =
    deps.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    deps.clearTimer ??
    ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let running = false;
  let failures = 0;
  /** Do not auto-run before this time (network backoff or server retryAfter). */
  let blockedUntil = 0;
  /** The part of `blockedUntil` that came from the server; focus keeps it. */
  let serverBlockedUntil = 0;
  let halted = false;
  let debounceTimer: unknown = null;
  let retryTimer: unknown = null;
  let intervalTimer: unknown = null;
  const cleanups: Array<() => void> = [];

  const clearRetry = () => {
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = null;
  };

  /** Ends ordinary backoff; a server-imposed wait stays. */
  const resetNetwork = () => {
    failures = 0;
    halted = false;
    blockedUntil = serverBlockedUntil;
    clearRetry();
    if (blockedUntil > now()) scheduleRetry();
  };

  function scheduleRetry() {
    clearRetry();
    retryTimer = setTimer(
      () => {
        retryTimer = null;
        void run();
      },
      Math.max(0, blockedUntil - now()),
    );
  }

  const settle = (state: string, retryAfter: number | null) => {
    if (state === "offline" || state === "error" || state === "daily_limit") {
      failures += 1;
      let delay = backoffDelay(failures);
      serverBlockedUntil = 0;
      if (retryAfter !== null && retryAfter > 0) {
        delay = Math.max(delay, retryAfter * 1000);
        serverBlockedUntil = now() + delay;
      }
      blockedUntil = now() + delay;
      scheduleRetry();
    } else if (state === "clock_ahead") {
      halted = true;
      clearRetry();
    } else {
      serverBlockedUntil = 0;
      resetNetwork();
    }
  };

  const run = async (): Promise<void> => {
    if (!running || !deps.hasLock() || halted) return;
    if (now() < blockedUntil) return;
    try {
      const status = await deps.api.getSyncStatus();
      if (!status.enabled) return;
      const result = await deps.api.syncNow();
      if (result.ok) {
        settle(result.status.state, result.status.retryAfter);
      } else if (result.reason === "offline") {
        settle("offline", null);
      } else if (
        result.reason === "rate_limited" ||
        result.reason === "daily_limit"
      ) {
        settle("daily_limit", result.retryAfter);
      }
      // Other refusals (not_active_tab, not_started, ...) need the user.
    } catch {
      // `syncNow` does not throw for sync outcomes; never break the timers.
    }
  };

  const onWake = () => {
    // Back online or back in the window: ordinary network backoff is over.
    resetNetwork();
    void run();
  };

  const notifyLocalWrite = () => {
    if (!running) return;
    if (debounceTimer !== null) clearTimer(debounceTimer);
    debounceTimer = setTimer(() => {
      debounceTimer = null;
      void run();
    }, SYNC_WRITE_DEBOUNCE_MS);
  };

  const listen = (
    source: EventSource | undefined,
    type: string,
    listener: () => void,
  ) => {
    if (!source) return;
    source.addEventListener(type, listener);
    cleanups.push(() => source.removeEventListener(type, listener));
  };

  const tick = () => {
    intervalTimer = setTimer(() => {
      void run();
      if (running) tick();
    }, SYNC_INTERVAL_MS);
  };

  const start = () => {
    if (running) return;
    running = true;
    listen(deps.windowEvents, "focus", onWake);
    listen(deps.windowEvents, "online", onWake);
    listen(deps.documentEvents, "visibilitychange", () => {
      if (deps.isVisible?.() ?? true) onWake();
    });
    // A manual sync (or enable) that succeeds ends any backoff or halt.
    cleanups.push(
      deps.api.onSyncChange(({ status }) => {
        if (status.state === "synced" || status.state === "pending") {
          serverBlockedUntil = 0;
          resetNetwork();
        }
      }),
    );
    tick();
    void run();
  };

  const stop = () => {
    running = false;
    for (const cleanup of cleanups.splice(0)) cleanup();
    for (const handle of [debounceTimer, retryTimer, intervalTimer]) {
      if (handle !== null) clearTimer(handle);
    }
    debounceTimer = retryTimer = intervalTimer = null;
  };

  return { start, stop, notifyLocalWrite };
};
