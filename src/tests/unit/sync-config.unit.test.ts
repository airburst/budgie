import { describe, expect, it } from "vitest";
import { parseSyncServerUrl, syncConnectOrigin } from "@/services/sync/config";

describe("parseSyncServerUrl", () => {
  it("is null when unset or blank", () => {
    expect(parseSyncServerUrl(undefined)).toBeNull();
    expect(parseSyncServerUrl("")).toBeNull();
    expect(parseSyncServerUrl("   ")).toBeNull();
  });

  it("accepts https and trims trailing slashes", () => {
    expect(parseSyncServerUrl("https://sync.example.dev/")).toBe(
      "https://sync.example.dev",
    );
    expect(parseSyncServerUrl("https://sync.example.dev/api/")).toBe(
      "https://sync.example.dev/api",
    );
  });

  it("accepts http only for localhost", () => {
    expect(parseSyncServerUrl("http://localhost:8787")).toBe(
      "http://localhost:8787",
    );
    expect(parseSyncServerUrl("http://127.0.0.1:4599")).toBe(
      "http://127.0.0.1:4599",
    );
    expect(() => parseSyncServerUrl("http://sync.example.dev")).toThrow();
  });

  it("rejects malformed values, credentials, queries and fragments", () => {
    expect(() => parseSyncServerUrl("not a url")).toThrow();
    expect(() => parseSyncServerUrl("https://u:p@sync.example.dev")).toThrow();
    expect(() => parseSyncServerUrl("https://sync.example.dev/?a=1")).toThrow();
    expect(() => parseSyncServerUrl("https://sync.example.dev/#x")).toThrow();
  });
});

describe("syncConnectOrigin", () => {
  it("is null without a url and the bare origin with one", () => {
    expect(syncConnectOrigin(null)).toBeNull();
    expect(syncConnectOrigin("https://sync.example.dev/api")).toBe(
      "https://sync.example.dev",
    );
  });
});
