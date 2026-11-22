import type { D1DatabaseLike } from "./d1-executor";
import { CONTRACT_VERSION } from "./version";

export interface Env {
  DB: D1DatabaseLike;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function handleRequest(request: Request): Response {
  const url = new URL(request.url);
  if (url.pathname === "/v1/health") {
    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405);
    }
    return json({ ok: true, contractVersion: CONTRACT_VERSION });
  }
  return json({ error: "not_found" }, 404);
}

export default {
  fetch(request: Request, _env: Env): Response {
    return handleRequest(request);
  },
};
