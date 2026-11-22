import type { SyncFailure, SyncStatusView } from "@/services/sync/api-types";
import { describe, expect, it } from "vitest";
import { InvalidOutgoingEnvelopeError } from "@/services/sync/errors";
import {
  describeImportError,
  describeSyncFailure,
  syncIndicator,
  syncNoticeNeedsAction,
  syncNoticeText,
} from "./sync-messages";

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

describe("sync notices and import errors", () => {
  it("says when a daily limit will be retried, or just later", () => {
    expect(syncNoticeText("daily_limit", null)).toContain("try again later");
    expect(syncNoticeText("daily_limit", "2026-03-08 00:00:00")).toMatch(
      /try again at \d\d:\d\d/,
    );
  });

  it("asks only for stopped states to be shown again after a reload", () => {
    expect(syncNoticeNeedsAction("update_needed")).toBe(true);
    expect(syncNoticeNeedsAction("disconnected")).toBe(true);
    expect(syncNoticeNeedsAction("clock_ahead")).toBe(false);
    expect(syncNoticeNeedsAction("daily_limit")).toBe(false);
  });

  it("reports an unsyncable import file by table and row", () => {
    const error = new InvalidOutgoingEnvelopeError("payees", "abc", "bad");
    expect(describeImportError(error)).toContain("This file can't be synced");
    expect(describeImportError(error)).toContain("payees, row abc");
    expect(describeImportError(new Error("Invalid checksum"))).toBe(
      "Invalid checksum",
    );
  });
});
