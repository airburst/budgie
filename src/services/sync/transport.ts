// The real `SyncTransport`: one `POST <base>/v1/sync` over `fetch`
// (SPEC.md 2 and 9.3), and the server client for the other endpoints (enrol,
// device codes, devices, delete data: SPEC.md 9.2 and 9.4 to 9.7, SY-035).
// Both share one request helper and one error mapping.
//
// - `200`: the body, after a shape check (a malformed body is
//   `SyncHttpError(200, "bad_response")`, a client-visible error).
// - Any other status: `SyncHttpError` from the server's error body
//   (section 2.4); `retryAfter` from the body or the `Retry-After` header.
//   A body that is not the contract's (a proxy's HTML page) gives
//   `server_error` for 5xx and `unknown` otherwise.
// - No answer at all (network, DNS, TLS, timeout, a redirect, which is never
//   followed): `SyncNetworkError`, i.e. "offline".

import type { SyncAuth, SyncTransport } from "@/services/sync/engine";
import {
  SyncHttpError,
  SyncNetworkError,
  SyncNotConfiguredError,
} from "@/services/sync/errors";
import type { SyncResponse } from "@/services/sync/payload";

export type FetchTransportOptions = {
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Used when `sync_state.server_url` is NULL. */
  baseUrl?: string;
  /** Per request; default 30 seconds. */
  timeoutMs?: number;
};

export const DEFAULT_SYNC_TIMEOUT_MS = 30_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSyncResponse = (value: unknown): value is SyncResponse =>
  isRecord(value) &&
  typeof value.formatVersion === "number" &&
  typeof value.cursor === "string" &&
  typeof value.more === "boolean" &&
  Array.isArray(value.pull) &&
  Array.isArray(value.rejected);

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `<base>/<path>`. HTTPS only, except a local development server. */
export const serverEndpoint = (base: string, path: string): string => {
  let url: URL;
  try {
    url = new URL(base.endsWith("/") ? base : `${base}/`);
  } catch {
    throw new SyncNotConfiguredError("a valid server url");
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))
  ) {
    throw new SyncNotConfiguredError("an https server url");
  }
  return new URL(path, url).toString();
};

/** `<base>/v1/sync`. */
export const syncEndpoint = (base: string): string =>
  serverEndpoint(base, "v1/sync");

/** Seconds from a `Retry-After` header (delta-seconds or an HTTP date). */
const retryAfterHeader = (value: string | null, nowMs: number) => {
  if (value === null) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim());
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - nowMs) / 1000));
};

const errorFromResponse = (response: Response, text: string) => {
  const parsed = parseJson(text);
  const body = isRecord(parsed) ? parsed : {};
  const code =
    typeof body.error === "string"
      ? body.error
      : response.status >= 500
        ? "server_error"
        : "unknown";
  const retryAfter =
    typeof body.retryAfter === "number"
      ? body.retryAfter
      : retryAfterHeader(response.headers.get("retry-after"), Date.now());
  return new SyncHttpError(response.status, code, retryAfter, body);
};

/**
 * One request: the response and its text, or `SyncNetworkError` when there
 * was no answer. Never follows redirects, never sends cookies.
 */
const sendRequest = async (
  options: FetchTransportOptions,
  url: string,
  init: { method: string; token?: string; body?: unknown },
): Promise<{ response: Response; text: string }> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers.Authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const response = await fetchImpl(url, {
      method: init.method,
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { response, text: await response.text() };
  } catch (error) {
    throw new SyncNetworkError(
      `Sync request did not complete: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
};

export const createFetchTransport = (
  options: FetchTransportOptions = {},
): SyncTransport => {
  return async (request, auth: SyncAuth) => {
    const base = auth.serverUrl ?? options.baseUrl;
    if (!base) throw new SyncNotConfiguredError("server url");
    const { response, text } = await sendRequest(options, syncEndpoint(base), {
      method: "POST",
      token: auth.token,
      body: request,
    });
    if (response.status !== 200) throw errorFromResponse(response, text);
    const body = parseJson(text);
    if (!isSyncResponse(body)) {
      throw new SyncHttpError(200, "bad_response");
    }
    return body;
  };
};

// ---------------------------------------------------------------------------
// Server client: the endpoints other than `POST /v1/sync`
// ---------------------------------------------------------------------------

export type EnrolResponse = {
  deviceId: string;
  token: string;
  /** The server holds rows for this user: offer Join, else Start. */
  hasData: boolean;
};

export type DeviceCode = { code: string; expiresAt: string };

export type SyncDevice = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  /** True for the device that made the request. */
  current: boolean;
};

export type DeleteDataResponse = {
  deletedRows: number;
  deletedSnapshots: number;
  timeTravelRetentionDays: number;
};

/**
 * Throws `SyncHttpError` for an error answer, `SyncNetworkError` for no
 * answer, `SyncNotConfiguredError` without a server url. `enrol` needs no
 * token and uses `baseUrl`; the others use `auth.serverUrl` (the stored one)
 * before `baseUrl`.
 */
export type SyncServerClient = {
  enrol: (request: {
    code: string;
    deviceName: string;
  }) => Promise<EnrolResponse>;
  createDeviceCode: (auth: SyncAuth) => Promise<DeviceCode>;
  listDevices: (auth: SyncAuth) => Promise<SyncDevice[]>;
  /** Revokes a device; the caller's own id signs this device out. */
  revokeDevice: (auth: SyncAuth, deviceId: string) => Promise<void>;
  deleteData: (auth: SyncAuth) => Promise<DeleteDataResponse>;
};

const isString = (value: unknown): value is string => typeof value === "string";

const isEnrolResponse = (value: unknown): value is EnrolResponse =>
  isRecord(value) &&
  isString(value.deviceId) &&
  isString(value.token) &&
  typeof value.hasData === "boolean";

const isDeviceCode = (value: unknown): value is DeviceCode =>
  isRecord(value) && isString(value.code) && isString(value.expiresAt);

const isSyncDevice = (value: unknown): value is SyncDevice =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.createdAt) &&
  (value.lastSeenAt === null || isString(value.lastSeenAt)) &&
  typeof value.current === "boolean";

const isDeleteDataResponse = (value: unknown): value is DeleteDataResponse =>
  isRecord(value) &&
  typeof value.deletedRows === "number" &&
  typeof value.deletedSnapshots === "number" &&
  typeof value.timeTravelRetentionDays === "number";

export const createFetchServerClient = (
  options: FetchTransportOptions = {},
): SyncServerClient => {
  const call = async (
    path: string,
    init: { method: string; auth?: SyncAuth; body?: unknown },
    success: number,
  ): Promise<unknown> => {
    const base = init.auth?.serverUrl ?? options.baseUrl;
    if (!base) throw new SyncNotConfiguredError("server url");
    const { response, text } = await sendRequest(
      options,
      serverEndpoint(base, path),
      { method: init.method, token: init.auth?.token, body: init.body },
    );
    if (response.status !== success) throw errorFromResponse(response, text);
    return success === 204 ? null : parseJson(text);
  };
  const checked = <T>(
    body: unknown,
    guard: (value: unknown) => value is T,
    status: number,
  ): T => {
    if (!guard(body)) throw new SyncHttpError(status, "bad_response");
    return body;
  };

  return {
    enrol: async (request) =>
      checked(
        await call("v1/enrol", { method: "POST", body: request }, 201),
        isEnrolResponse,
        201,
      ),
    createDeviceCode: async (auth) =>
      checked(
        await call("v1/devices/code", { method: "POST", auth, body: {} }, 201),
        isDeviceCode,
        201,
      ),
    listDevices: async (auth) => {
      const body = await call("v1/devices", { method: "GET", auth }, 200);
      if (
        !isRecord(body) ||
        !Array.isArray(body.devices) ||
        !body.devices.every(isSyncDevice)
      ) {
        throw new SyncHttpError(200, "bad_response");
      }
      return body.devices;
    },
    revokeDevice: async (auth, deviceId) => {
      await call(
        `v1/devices/${encodeURIComponent(deviceId)}`,
        { method: "DELETE", auth },
        204,
      );
    },
    deleteData: async (auth) =>
      checked(
        await call("v1/data", { method: "DELETE", auth }, 200),
        isDeleteDataResponse,
        200,
      ),
  };
};
