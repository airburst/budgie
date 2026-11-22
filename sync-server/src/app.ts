import { addUser, newInvite } from "./admin";
import { handleEnrol } from "./enrol";
import { ApiError, errorResponse, jsonResponse } from "./errors";
import type { SqlExecutor } from "./executor";
import { readJsonBody } from "./http";
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
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError("bad_request");
  }
  return value as Record<string, unknown>;
}

async function route(request: Request, deps: AppDeps): Promise<Response> {
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
    case "POST /v1/sync":
      return handleSync(request, { ...deps, pageSize: deps.pageSize });
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

export async function handleRequest(
  request: Request,
  deps: AppDeps,
): Promise<Response> {
  try {
    return await route(request, deps);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error);
    // Never log the error message: it can echo SQL parameters.
    console.error(
      JSON.stringify({
        route: new URL(request.url).pathname,
        status: 500,
        reason: error instanceof Error ? error.name : "unknown",
      }),
    );
    return errorResponse(new ApiError("server_error"));
  }
}
