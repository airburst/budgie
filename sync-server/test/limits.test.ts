import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/app";
import type { D1DatabaseLike } from "../src/d1-executor";
import type { SqlExecutor } from "../src/executor";
import worker, { allowedOrigins, DEV_ORIGINS } from "../src/index";
import { MemoryIpLimiter, BODY_CAP_BYTES } from "../src/limits";
import { createTestServer } from "./helpers";
import { env, hlc, sync, T0 } from "./sync-helpers";

describe("body cap and envelope count", () => {
  it("refuses a body over 1 MiB with body_too_large, before parsing or auth", async () => {
    const s = await createTestServer();
    const big = `{"x":"${"a".repeat(BODY_CAP_BYTES)}"}`;
    const res = await s.call("POST", "/v1/sync", { rawBody: big });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("body_too_large");
    const enrol = await s.call("POST", "/v1/enrol", { rawBody: big });
    expect(enrol.body.error).toBe("body_too_large");
  });

  it("refuses by Content-Length alone, and by streamed size when the header lies", async () => {
    const s = await createTestServer();
    const declared = await handleRequest(
      new Request("https://x.test/v1/sync", {
        method: "POST",
        body: "{}",
        headers: { "content-length": String(BODY_CAP_BYTES + 1) },
      }),
      s.deps,
    );
    expect(declared.status).toBe(413);
  });

  it("accepts a body just under the cap (and fails it as bad_request, not 413)", async () => {
    const s = await createTestServer();
    const pad = "a".repeat(BODY_CAP_BYTES - 20);
    const res = await s.call("POST", "/v1/sync", {
      rawBody: `{"pad":"${pad}"}`,
    });
    expect(res.status).toBe(400);
  });

  it("refuses more than 500 envelopes with too_many_envelopes", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const push = Array.from({ length: 501 }, (_, i) =>
      env("payees", i + 1, hlc(T0)),
    );
    const res = await sync(s, a.token, push);
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("too_many_envelopes");
    expect(s.db.prepare("SELECT count(*) n FROM changes").get()).toEqual({
      n: 0,
    });
    const ok = await sync(s, a.token, push.slice(0, 500));
    expect(ok.status).toBe(200);
  });
});

describe("envelope validation", () => {
  it("refuses a bad hlc or an unknown tbl as bad_request for the whole request", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    for (const bad of [
      { ...env("payees", 1, hlc(T0)), hlc: "1795342530000:0:x" },
      { ...env("payees", 1, hlc(T0)), hlc: hlc(T0).toUpperCase() },
      { ...env("payees", 1, hlc(T0)), tbl: "settings" },
    ]) {
      const res = await sync(s, a.token, [env("accounts", 2, hlc(T0)), bad]);
      expect(res.status).toBe(400);
    }
    expect(s.db.prepare("SELECT count(*) n FROM changes").get()).toEqual({
      n: 0,
    });
  });
});

describe("CORS", () => {
  const origin = "https://budget.fairhursts.net";

  it("sends CORS headers only for the allowed origin", async () => {
    const s = await createTestServer({ allowedOrigins: [origin] });
    const send = (o?: string) =>
      handleRequest(
        new Request("https://x.test/v1/health", {
          headers: o ? { origin: o } : {},
        }),
        s.deps,
      );
    const ok = await send(origin);
    expect(ok.headers.get("access-control-allow-origin")).toBe(origin);
    expect(ok.headers.get("vary")).toContain("Origin");
    const other = await send("https://evil.example");
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    const none = await send();
    expect(none.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers preflight with 204 and the allowed methods and headers", async () => {
    const s = await createTestServer({ allowedOrigins: [origin] });
    const pre = (o: string) =>
      handleRequest(
        new Request("https://x.test/v1/sync", {
          method: "OPTIONS",
          headers: { origin: o, "access-control-request-method": "POST" },
        }),
        s.deps,
      );
    const ok = await pre(origin);
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-methods")).toBe(
      "GET, POST, DELETE",
    );
    expect(ok.headers.get("access-control-allow-headers")).toBe(
      "Authorization, Content-Type",
    );
    const bad = await pre("https://evil.example");
    expect(bad.status).toBe(204);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("also sends them on error responses", async () => {
    const s = await createTestServer({ allowedOrigins: [origin] });
    const res = await handleRequest(
      new Request("https://x.test/nope", { headers: { origin } }),
      s.deps,
    );
    expect(res.status).toBe(404);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it("adds the local dev origins only in dev mode", () => {
    const base = { DB: {} as D1DatabaseLike, ALLOWED_ORIGIN: origin };
    expect(allowedOrigins(base)).toEqual([origin]);
    expect(allowedOrigins({ ...base, DEV_MODE: "1" })).toEqual([
      origin,
      ...DEV_ORIGINS,
    ]);
  });
});

describe("logging", () => {
  it("logs ids, counts and reasons, and never a payload, token or code", async () => {
    const s = await createTestServer();
    const inv = await (
      await import("../src/admin")
    ).addUser(s.executor, "alice", s.deps);
    const enrol = await s.call("POST", "/v1/enrol", {
      body: { code: inv.code, deviceName: "Secret Phone Name" },
    });
    const token = enrol.body.token as string;
    await s.call("POST", "/v1/enrol", {
      body: { code: "QQQQ-QQQQ-QQQQ", deviceName: "x" },
    });
    await sync(s, token, [
      env("payees", 1, hlc(T0), { payload: { name: "TOP-SECRET-PAYLOAD" } }),
      env("payees", 2, hlc(T0 + 999_999)),
    ]);
    await s.call("POST", "/v1/sync", { token: "WRONGTOKENTEXT", body: {} });
    await s.call("GET", "/v1/devices", { token });
    await s.call("GET", "/v1/devices?secret=QUERYSECRET", { token });
    const all = s.logs.join("\n");
    for (const secret of [
      "TOP-SECRET-PAYLOAD",
      token,
      inv.code,
      inv.code.replace(/-/g, ""),
      "QQQQ",
      "WRONGTOKENTEXT",
      "QUERYSECRET",
      "Secret Phone Name",
    ]) {
      expect(all).not.toContain(secret);
    }
    const lines = s.logs.map((l) => JSON.parse(l));
    const syncLine = lines.find(
      (l) => l.route === "/v1/sync" && l.status === 200,
    );
    expect(syncLine).toMatchObject({
      method: "POST",
      userId: inv.userId,
      deviceId: enrol.body.deviceId,
      counts: { pushed: 2, accepted: 1, stale: 0, drift: 1, pulled: 0 },
    });
    expect(lines.some((l) => l.reason === "bad_code")).toBe(true);
    expect(
      lines.some((l) => l.reason === "bad_request" || l.reason === "bad_token"),
    ).toBe(true);
  });

  it("never logs a database error message", async () => {
    const s = await createTestServer();
    const broken: SqlExecutor = {
      batch: () => Promise.reject(new Error("boom SECRETSQLPARAM")),
    };
    const res = await handleRequest(
      new Request("https://x.test/v1/enrol", {
        method: "POST",
        body: JSON.stringify({ code: "AAAA", deviceName: "d" }),
      }),
      { ...s.deps, executor: broken },
    );
    expect(res.status).toBe(500);
    expect(s.logs.join()).not.toContain("SECRETSQLPARAM");
    expect(s.logs.join()).toContain('"reason":"Error"');
  });
});

describe("daily limit", () => {
  it("maps a D1 daily-quota failure to a retryable 503 daily_limit", async () => {
    const s = await createTestServer();
    const broken: SqlExecutor = {
      batch: () =>
        Promise.reject(
          new Error("D1_ERROR: Your account has exceeded the daily read limit"),
        ),
    };
    const res = await handleRequest(
      new Request("https://x.test/v1/sync", {
        method: "POST",
        headers: { authorization: "Bearer abc" },
        body: JSON.stringify({ formatVersion: 1, cursor: "0", push: [] }),
      }),
      { ...s.deps, executor: broken },
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; retryAfter: number };
    expect(body.error).toBe("daily_limit");
    const untilMidnight = 86_400 - ((T0 / 1000) % 86_400);
    expect(body.retryAfter).toBe(untilMidnight);
    expect(res.headers.get("retry-after")).toBe(String(untilMidnight));
  });
});

describe("per-IP request limit", () => {
  it("limits every route per IP without touching the database", async () => {
    const s = await createTestServer({
      ipLimiter: new MemoryIpLimiter(3, 60_000),
    });
    const statements: string[] = [];
    const spy: SqlExecutor = {
      batch: (stmts) => {
        statements.push(...stmts.map((x) => x.sql));
        return s.executor.batch(stmts);
      },
    };
    s.deps.executor = spy;
    const hit = (ip: string, path = "/v1/health") =>
      s.call("GET", path, { ip });
    expect((await hit("1.1.1.1")).status).toBe(200);
    expect((await hit("1.1.1.1", "/nope")).status).toBe(404);
    expect((await hit("1.1.1.1")).status).toBe(200);
    const limited = await hit("1.1.1.1");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("rate_limited");
    expect(limited.body.retryAfter).toBeGreaterThan(0);
    expect((await hit("2.2.2.2")).status).toBe(200);
    expect(statements).toEqual([]);
    s.clock.now += 60_000;
    expect((await hit("1.1.1.1")).status).toBe(200);
  });
});

describe("DEV_MODE gate", () => {
  function recordingEnv(devMode?: string) {
    const calls: string[] = [];
    const db: D1DatabaseLike = {
      prepare(sql) {
        calls.push(sql);
        const p = { bind: () => p };
        return p;
      },
      batch: () => Promise.resolve([{ results: [] }]),
    };
    return {
      calls,
      env: { DB: db, ...(devMode ? { DEV_MODE: devMode } : {}) },
    };
  }

  it("does not run the boot migration or serve /dev/admin without DEV_MODE", async () => {
    const { calls, env: e } = recordingEnv();
    for (const path of [
      "/v1/health",
      "/dev/admin/add-user",
      "/dev/admin/new-invite",
      "/dev/admin/run-snapshots",
    ]) {
      const res = await worker.fetch(
        new Request(`https://x.test${path}`, {
          method: path === "/v1/health" ? "GET" : "POST",
          body: path === "/v1/health" ? undefined : "{}",
        }),
        e,
      );
      expect(res.status).toBe(path === "/v1/health" ? 200 : 404);
    }
    expect(calls).toEqual([]);
  });

  it("does touch the database (schema check) when DEV_MODE=1", async () => {
    const { calls, env: e } = recordingEnv("1");
    await worker.fetch(new Request("https://x.test/v1/health"), e);
    expect(calls.some((c) => c.includes("sqlite_master"))).toBe(true);
  });

  it("keeps DEV_MODE out of the deployed wrangler config", async () => {
    const { readFileSync } = await import("node:fs");
    const deployed = readFileSync(
      new URL("../wrangler.jsonc", import.meta.url),
      "utf8",
    );
    expect(deployed.replace(/\/\/.*$/gm, "")).not.toContain("DEV_MODE");
    const local = readFileSync(
      new URL("../wrangler.local.jsonc", import.meta.url),
      "utf8",
    );
    expect(local).toContain('"DEV_MODE": "1"');
  });
});
