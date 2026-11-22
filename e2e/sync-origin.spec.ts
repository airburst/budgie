// SY-036: the service worker never intercepts or caches sync-server traffic.
// Runs against a second build (see playwright.config.ts) whose sync URL points
// at a local stub this test controls.
import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";

const STUB_PORT = 4599;
const STUB = `http://127.0.0.1:${STUB_PORT}`;

let server: Server;
let hits: Array<{ method: string; auth: string | undefined }> = [];
let counter = 0;

test.beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push({ method: req.method ?? "", auth: req.headers.authorization });
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:4174");
    res.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    // Like the real server: the browser HTTP cache must not hide a service worker cache hit.
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ n: ++counter }));
  });
  await new Promise<void>((resolve) =>
    server.listen(STUB_PORT, "127.0.0.1", resolve),
  );
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("requests to the sync origin bypass the service worker and its caches", async ({
  page,
  context,
}) => {
  hits = [];
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain(
    `connect-src 'self' ${STUB}`,
  );
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.active),
      ),
    )
    .toBe(true);
  // Make sure the worker controls this page, so its fetch handler is in play.
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);

  const call = (method: string, path: string) =>
    page.evaluate(
      async ([url, m]) => {
        const r = await fetch(url as string, {
          method: m as string,
          headers: {
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          },
          body: m === "POST" ? "{}" : undefined,
        });
        return ((await r.json()) as { n: number }).n;
      },
      [`${STUB}${path}`, method],
    );

  // Same request twice: both must reach the stub (a cache would answer #2).
  const first = await call("POST", "/v1/sync");
  const second = await call("POST", "/v1/sync");
  expect(second).toBeGreaterThan(first);
  await call("DELETE", "/v1/sync");
  const getFirst = await call("GET", "/v1/ping");
  const getSecond = await call("GET", "/v1/ping");
  expect(getSecond).toBeGreaterThan(getFirst);

  const real = hits.filter((h) => h.method !== "OPTIONS");
  expect(real.map((h) => h.method)).toEqual([
    "POST",
    "POST",
    "DELETE",
    "GET",
    "GET",
  ]);
  expect(real.every((h) => h.auth === "Bearer test-token")).toBe(true);

  // Nothing for the sync origin ended up in any Cache Storage cache.
  const cached = await page.evaluate(async (origin) => {
    const found: string[] = [];
    for (const name of await caches.keys())
      for (const req of await (await caches.open(name)).keys())
        if (req.url.startsWith(origin)) found.push(req.url);
    return found;
  }, STUB);
  expect(cached).toEqual([]);

  // Offline: the requests must fail, not be answered from a cache.
  const before = hits.length;
  await context.setOffline(true);
  const attempt = (method: string, path: string) =>
    page.evaluate(
      async ([url, m]) => {
        try {
          await fetch(url as string, {
            method: m as string,
            headers: { Authorization: "Bearer test-token" },
            body: m === "POST" ? "{}" : undefined,
          });
          return "answered";
        } catch {
          return "failed";
        }
      },
      [`${STUB}${path}`, method],
    );
  const outcomes = [
    await attempt("POST", "/v1/sync"),
    await attempt("GET", "/v1/ping"),
  ];
  await context.setOffline(false);
  expect(outcomes).toEqual(["failed", "failed"]);
  expect(hits.length).toBe(before);
});
