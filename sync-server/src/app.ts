import { addUser, newInvite } from "./admin";
import {
  handleDeviceCode,
  handleListDevices,
  handleRevokeDevice,
} from "./devices";
import { handleEnrol } from "./enrol";
import { ApiError, errorResponse, jsonResponse } from "./errors";
import type { SqlExecutor } from "./executor";
import { readJsonBody } from "./http";
import {
  isDailyLimitError,
  MemoryIpLimiter,
  readCappedBody,
  secondsToUtcMidnight,
} from "./limits";
import { consoleSink, writeLog, type LogContext, type LogSink } from "./log";
import { clientIp } from "./rate-limit";
import { handleSync } from "./sync";
import { CONTRACT_VERSION, FORMAT_VERSION } from "./version";

export interface AppDeps {
  executor: SqlExecutor;
  now: () => number;
  /**
   * Local development only (a var set in wrangler.local.jsonc, never in the
   * deployed config). Enables the /dev/admin routes.
   */
  devMode: boolean;
  /** Pull page size; defaults to 500 (SPEC 9.3). Tests use small values. */
  pageSize?: number;
  /** Origins that get CORS headers (SPEC 2.3). Empty by default: none. */
  allowedOrigins?: string[];
  /** Per-IP request limiter on every route (in memory; see README). */
  ipLimiter?: MemoryIpLimiter;
  logSink?: LogSink;
}

export type HandlerDeps = AppDeps & { ctx: LogContext };

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError("bad_request");
  }
  return value as Record<string, unknown>;
}

const KNOWN_ROUTES = new Set([
  "GET /v1/health",
  "POST /v1/enrol",
  "GET /v1/devices",
  "POST /v1/devices/code",
  "POST /v1/sync",
]);

/** A log-safe route label: never contains ids, tokens or arbitrary paths. */
function routeLabel(method: string, pathname: string): string {
  if (KNOWN_ROUTES.has(`${method} ${pathname}`)) return pathname;
  if (method === "DELETE" && /^\/v1\/devices\/[^/]+$/.test(pathname)) {
    return "/v1/devices/:id";
  }
  if (pathname.startsWith("/dev/admin/")) return "/dev/admin";
  return "unmatched";
}

async function route(request: Request, deps: HandlerDeps): Promise<Response> {
  const { pathname } = new URL(request.url);
  const key = `${request.method} ${pathname}`;

  switch (key) {
    case "GET /v1/health":
      return jsonResponse({
        status: "ok",
        formatVersion: FORMAT_VERSION,
        contractVersion: CONTRACT_VERSION,
      });
    case "POST /v1/enrol":
      return handleEnrol(request, deps);
    case "GET /v1/devices":
      return handleListDevices(request, deps);
    case "POST /v1/devices/code":
      return handleDeviceCode(request, deps);
    case "POST /v1/sync":
      return handleSync(request, deps);
  }

  const revoke = /^\/v1\/devices\/([^/]+)$/.exec(pathname);
  if (revoke && request.method === "DELETE") {
    return handleRevokeDevice(request, deps, revoke[1] as string);
  }

  if (deps.devMode && request.method === "POST") {
    // Dev-only admin access, so a user and invite can be seeded on a running
    // celld (e2e). The same functions back the CLI scripts.
    if (pathname === "/dev/admin/add-user") {
      const body = asRecord(await readJsonBody(request));
      if (typeof body.name !== "string") throw new ApiError("bad_request");
      return jsonResponse(
        await addUser(deps.executor, body.name, { now: deps.now }),
        201,
      );
    }
    if (pathname === "/dev/admin/new-invite") {
      const body = asRecord(await readJsonBody(request));
      if (typeof body.user !== "string") throw new ApiError("bad_request");
      try {
        return jsonResponse(
          await newInvite(deps.executor, body.user, { now: deps.now }),
          201,
        );
      } catch (error) {
        if (error instanceof Error && /^No user/.test(error.message)) {
          throw new ApiError("not_found");
        }
        throw error;
      }
    }
  }

  throw new ApiError("not_found");
}

/** Rate limit, preflight, body cap, then the route (SPEC 2.4 order). */
async function pipeline(
  request: Request,
  deps: HandlerDeps,
): Promise<Response> {
  const retryAfter = deps.ipLimiter?.check(clientIp(request), deps.now());
  if (retryAfter) throw new ApiError("rate_limited", { retryAfter });

  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  const text = await readCappedBody(request);
  const bounded =
    text === null
      ? request
      : new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: text,
        });
  return route(bounded, deps);
}

function withCors(
  response: Response,
  request: Request,
  allowed: string[] | undefined,
): Response {
  const origin = request.headers.get("origin");
  const headers = new Headers(response.headers);
  headers.append("vary", "Origin");
  if (origin && allowed?.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-expose-headers", "Retry-After");
    if (request.method === "OPTIONS") {
      headers.set("access-control-allow-methods", "GET, POST, DELETE");
      headers.set(
        "access-control-allow-headers",
        "Authorization, Content-Type",
      );
      headers.set("access-control-max-age", "600");
    }
  }
  return new Response(response.body, { status: response.status, headers });
}

export async function handleRequest(
  request: Request,
  deps: AppDeps,
): Promise<Response> {
  const ctx: LogContext = {};
  const url = new URL(request.url);
  let response: Response;
  try {
    response = await pipeline(request, { ...deps, ctx });
  } catch (error) {
    if (error instanceof ApiError) {
      ctx.reason = error.code;
      response = errorResponse(error);
    } else if (isDailyLimitError(error)) {
      ctx.reason = "daily_limit";
      response = errorResponse(
        new ApiError("daily_limit", {
          retryAfter: secondsToUtcMidnight(deps.now()),
        }),
      );
    } else {
      // Never log the error message: it can echo SQL parameters.
      ctx.reason = error instanceof Error ? error.name : "unknown";
      response = errorResponse(new ApiError("server_error"));
    }
  }
  writeLog(
    deps.logSink ?? consoleSink,
    routeLabel(request.method, url.pathname),
    request.method,
    response.status,
    ctx,
  );
  return withCors(response, request, deps.allowedOrigins);
}
