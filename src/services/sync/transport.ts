// The real `SyncTransport`: one `POST <base>/v1/sync` over `fetch`
// (SPEC.md 2 and 9.3). Not wired into the app here (SY-035 does that).
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

/** `<base>/v1/sync`. HTTPS only, except a local development server. */
export const syncEndpoint = (base: string): string => {
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
  return new URL("v1/sync", url).toString();
};

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

export const createFetchTransport = (
  options: FetchTransportOptions = {},
): SyncTransport => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS;
  return async (request, auth: SyncAuth) => {
    const base = auth.serverUrl ?? options.baseUrl;
    if (!base) throw new SyncNotConfiguredError("server url");
    const url = syncEndpoint(base);
    const fetchImpl = options.fetch ?? globalThis.fetch;

    let response: Response;
    let text: string;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        redirect: "error",
        credentials: "omit",
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      throw new SyncNetworkError(
        `Sync request did not complete: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    if (response.status !== 200) throw errorFromResponse(response, text);
    const body = parseJson(text);
    if (!isSyncResponse(body)) {
      throw new SyncHttpError(200, "bad_response");
    }
    return body;
  };
};
