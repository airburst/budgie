import type { SyncFailure, SyncStatusView } from "@/services/sync/api-types";
import { describe, expect, it } from "vitest";
import { describeSyncFailure, syncIndicator } from "./sync-messages";

const status = (patch: Partial<SyncStatusView>): SyncStatusView => ({
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

const failure = (patch: Partial<SyncFailure>): SyncFailure => ({
  ok: false,
  reason: "error",
  message: "boom",
  retryAfter: null,
  ...patch,
});

describe("syncIndicator", () => {
  it("is absent when sync is off, unsupported or unconfigured", () => {
    expect(syncIndicator(null)).toBeNull();
    expect(
      syncIndicator(status({ state: "disabled", enabled: false })),
    ).toBeNull();
    expect(syncIndicator(status({ supported: false }))).toBeNull();
    expect(syncIndicator(status({ configured: false }))).toBeNull();
    expect(syncIndicator(status({ started: false }))).toBeNull();
  });

  it("maps states to synced, pending N, offline and error", () => {
    expect(syncIndicator(status({}))).toEqual({
      kind: "synced",
      label: "Synced",
    });
    expect(
      syncIndicator(status({ state: "pending", pendingCount: 3 })),
    ).toEqual({ kind: "pending", label: "Pending 3" });
    expect(syncIndicator(status({ state: "offline" }))?.kind).toBe("offline");
    for (const state of ["error", "disconnected", "clock_ahead"] as const) {
      expect(syncIndicator(status({ state }))?.kind).toBe("error");
    }
  });
});

describe("describeSyncFailure", () => {
  it("explains a bad code and says nothing changed", () => {
    expect(describeSyncFailure(failure({ reason: "bad_code" }))).toMatch(
      /not recognised.*Nothing has been changed/,
    );
  });

  it("uses the retry time for rate limits and falls back to the message", () => {
    expect(
      describeSyncFailure(failure({ reason: "rate_limited", retryAfter: 30 })),
    ).toContain("30 seconds");
    expect(describeSyncFailure(failure({}))).toBe("boom");
  });
});
