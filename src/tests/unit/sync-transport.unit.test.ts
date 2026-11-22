// SY-033: the fetch-based SyncTransport, with a fake fetch.
import {
  SyncHttpError,
  SyncNetworkError,
  SyncNotConfiguredError,
} from "@/services/sync/errors";
import type { SyncRequest, SyncResponse } from "@/services/sync/payload";
import { classifySyncError } from "@/services/sync/status";
import {
  createFetchServerClient,
  createFetchTransport,
  syncEndpoint,
} from "@/services/sync/transport";
import { describe, expect, it, vi } from "vitest";

const request: SyncRequest = { formatVersion: 1, cursor: "0", push: [] };
const auth = { token: "tok_123", serverUrl: "https://sync.example.dev" };
const ok: SyncResponse = {
  formatVersion: 1,
  cursor: "1:5",
  more: false,
  pull: [],
  rejected: [],
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const fakeFetch = (respond: () => Response | Promise<Response>) =>
  vi.fn<typeof fetch>(() => Promise.resolve(respond()));

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
};

describe("createFetchTransport", () => {
  it("POSTs the request as JSON with the bearer token and returns the body", async () => {
    const fetchImpl = fakeFetch(() => json(ok));
    const transport = createFetchTransport({ fetch: fetchImpl });
    expect(await transport(request, auth)).toEqual(ok);

    const [url, init] = fetchImpl.mock.calls[0] as [
      string,
      NonNullable<Parameters<typeof fetch>[1]>,
    ];
    expect(url).toBe("https://sync.example.dev/v1/sync");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer tok_123",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual(request);
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("builds the endpoint from a base with a path or a trailing slash", () => {
    expect(syncEndpoint("https://x.workers.dev/")).toBe("https://x.workers.dev/v1/sync");
    expect(syncEndpoint("https://x.dev/api")).toBe("https://x.dev/api/v1/sync");
    expect(syncEndpoint("http://localhost:8787")).toBe("http://localhost:8787/v1/sync");
    expect(() => syncEndpoint("http://sync.example.dev")).toThrow(SyncNotConfiguredError);
    expect(() => syncEndpoint("not a url")).toThrow(SyncNotConfiguredError);
  });

  it("falls back to the configured base URL, and needs one", async () => {
    const fetchImpl = fakeFetch(() => json(ok));
    await createFetchTransport({ fetch: fetchImpl, baseUrl: "https://b.dev" })(request, {
      token: "t",
      serverUrl: null,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://b.dev/v1/sync");
    await expect(
      createFetchTransport({ fetch: fetchImpl })(request, { token: "t", serverUrl: null }),
    ).rejects.toBeInstanceOf(SyncNotConfiguredError);
  });

  it.each([
    [401, { error: "revoked", message: "x" }, {}, "revoked", null],
    [401, { error: "bad_token", message: "x" }, {}, "bad_token", null],
    [409, { error: "data_reset", message: "x" }, {}, "data_reset", null],
    [429, { error: "rate_limited", message: "x", retryAfter: 30 }, {}, "rate_limited", 30],
    [503, { error: "daily_limit", message: "x" }, { "retry-after": "3600" }, "daily_limit", 3600],
    [500, { error: "server_error", message: "x" }, {}, "server_error", null],
  ])("maps %i %j to SyncHttpError", async (status, body, headers, code, retryAfter) => {
    const transport = createFetchTransport({ fetch: fakeFetch(() => json(body, status, headers)) });
    const error = await failure(transport(request, auth));
    expect(error).toBeInstanceOf(SyncHttpError);
    expect(error).toMatchObject({ status, code, retryAfter });
  });

  it("keeps the error body (format_too_old carries the server's version)", async () => {
    const transport = createFetchTransport({
      fetch: fakeFetch(() =>
        json({ error: "format_too_old", message: "x", formatVersion: 3 }, 409),
      ),
    });
    const error = await failure(transport(request, auth));
    expect(error).toMatchObject({ code: "format_too_old", body: { formatVersion: 3 } });
    expect(classifySyncError(error)).toMatchObject({ state: "update_needed", formatVersion: 3 });
  });

  it("maps a non-contract error page by status", async () => {
    const html = (status: number) => () => new Response("<html>Bad gateway</html>", { status });
    const gateway = await failure(createFetchTransport({ fetch: fakeFetch(html(502)) })(request, auth));
    expect(gateway).toMatchObject({ status: 502, code: "server_error" });
    const teapot = await failure(createFetchTransport({ fetch: fakeFetch(html(418)) })(request, auth));
    expect(teapot).toMatchObject({ status: 418, code: "unknown" });
  });

  it("refuses a malformed 200 body", async () => {
    const transport = createFetchTransport({ fetch: fakeFetch(() => json({ hello: "world" })) });
    expect(await failure(transport(request, auth))).toMatchObject({ status: 200, code: "bad_response" });
  });

  it("treats no answer as a network failure (offline)", async () => {
    const refused = createFetchTransport({
      fetch: vi.fn<typeof fetch>(() => Promise.reject(new TypeError("Failed to fetch"))),
    });
    const error = await failure(refused(request, auth));
    expect(error).toBeInstanceOf(SyncNetworkError);
    expect(classifySyncError(error).state).toBe("offline");

    const hanging = createFetchTransport({
      timeoutMs: 5,
      fetch: vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      ),
    });
    expect(await failure(hanging(request, auth))).toBeInstanceOf(SyncNetworkError);
  });
});

describe("classifySyncError", () => {
  it.each([
    [new SyncHttpError(401, "revoked"), "disconnected"],
    [new SyncHttpError(409, "data_reset"), "cloud_data_deleted"],
    [new SyncHttpError(503, "daily_limit", 60), "daily_limit"],
    [new SyncHttpError(429, "rate_limited", 30), "error"],
    [new SyncHttpError(400, "bad_request"), "error"],
    [new SyncHttpError(413, "too_many_envelopes"), "error"],
    [new Error("boom"), "error"],
  ])("%s -> %s", (error, state) => {
    expect(classifySyncError(error).state).toBe(state);
  });
});

describe("createFetchServerClient", () => {
  const base = { baseUrl: "https://sync.example.dev" };
  const authed = { token: "tok_123", serverUrl: null };

  it("enrols without a token and returns the checked body", async () => {
    const fetchImpl = fakeFetch(() =>
      json({ deviceId: "d1", token: "t1", hasData: true }, 201),
    );
    const client = createFetchServerClient({ ...base, fetch: fetchImpl });
    expect(await client.enrol({ code: "AAAA-BBBB", deviceName: "Mac" })).toEqual({
      deviceId: "d1",
      token: "t1",
      hasData: true,
    });
    const [url, init] = fetchImpl.mock.calls[0] as [
      string,
      NonNullable<Parameters<typeof fetch>[1]>,
    ];
    expect(url).toBe("https://sync.example.dev/v1/enrol");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      code: "AAAA-BBBB",
      deviceName: "Mac",
    });
    expect(init.credentials).toBe("omit");
    expect(init.redirect).toBe("error");
  });

  it("maps a bad code to SyncHttpError and no answer to SyncNetworkError", async () => {
    const bad = createFetchServerClient({
      ...base,
      fetch: fakeFetch(() => json({ error: "bad_code" }, 400)),
    });
    const error = await failure(bad.enrol({ code: "x", deviceName: "y" }));
    expect(error).toBeInstanceOf(SyncHttpError);
    expect(error).toMatchObject({ status: 400, code: "bad_code" });

    const down = createFetchServerClient({
      ...base,
      fetch: vi.fn<typeof fetch>(() => Promise.reject(new TypeError("offline"))),
    });
    expect(await failure(down.listDevices(authed))).toBeInstanceOf(
      SyncNetworkError,
    );
  });

  it("calls the device and data endpoints with the bearer token", async () => {
    const calls: Array<[string, string, unknown]> = [];
    const fetchImpl = vi.fn<typeof fetch>((url, init) => {
      calls.push([String(url), init?.method ?? "", init?.headers]);
      const path = new URL(String(url)).pathname;
      if (path === "/v1/devices/code") {
        return Promise.resolve(json({ code: "CODE-1234", expiresAt: "t" }, 201));
      }
      if (path === "/v1/devices") {
        return Promise.resolve(
          json({
            devices: [
              {
                id: "d1",
                name: "Mac",
                createdAt: "t",
                lastSeenAt: null,
                current: true,
              },
            ],
          }),
        );
      }
      if (path === "/v1/data") {
        return Promise.resolve(
          json({ deletedRows: 3, deletedSnapshots: 1, timeTravelRetentionDays: 7 }),
        );
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const client = createFetchServerClient({ ...base, fetch: fetchImpl });
    expect(await client.createDeviceCode(authed)).toEqual({
      code: "CODE-1234",
      expiresAt: "t",
    });
    expect((await client.listDevices(authed))[0]?.name).toBe("Mac");
    await client.revokeDevice(authed, "a/b");
    expect((await client.deleteData(authed)).deletedRows).toBe(3);
    expect(calls.map(([url, method]) => `${method} ${url}`)).toEqual([
      "POST https://sync.example.dev/v1/devices/code",
      "GET https://sync.example.dev/v1/devices",
      "DELETE https://sync.example.dev/v1/devices/a%2Fb",
      "DELETE https://sync.example.dev/v1/data",
    ]);
    for (const [, , headers] of calls) {
      expect(headers).toMatchObject({ Authorization: "Bearer tok_123" });
    }
  });

  it("treats a malformed success body as bad_response", async () => {
    const client = createFetchServerClient({
      ...base,
      fetch: fakeFetch(() => json({ nope: true }, 201)),
    });
    expect(await failure(client.createDeviceCode(authed))).toMatchObject({
      status: 201,
      code: "bad_response",
    });
  });

  it("needs a server url, and refuses plain http", async () => {
    const none = createFetchServerClient({ fetch: fakeFetch(() => json({})) });
    expect(await failure(none.listDevices(authed))).toBeInstanceOf(
      SyncNotConfiguredError,
    );
    const http = createFetchServerClient({
      baseUrl: "http://sync.example.dev",
      fetch: fakeFetch(() => json({})),
    });
    expect(
      await failure(http.enrol({ code: "x", deviceName: "y" })),
    ).toBeInstanceOf(SyncNotConfiguredError);
  });
});
