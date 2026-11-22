import { describe, expect, it } from "vitest";
import type { SqlExecutor } from "../src/executor";
import { MAX_PUSH_PARAM_BYTES } from "../src/sync";
import { runSnapshots } from "../src/snapshot";
import { FailedAttemptGuard } from "../src/rate-limit";
import { MemoryStore } from "../src/store";
import { createTestServer, type TestServer } from "./helpers";
import { hlc, id, T0 } from "./sync-helpers";

/** Count statements that write to rate_limits. */
function spyRateLimitWrites(s: TestServer) {
  const real = s.executor;
  const writes: string[] = [];
  s.deps.executor = {
    batch(st) {
      for (const x of st) {
        if (
          /rate_limits/.test(x.sql) &&
          /^\s*(INSERT|UPDATE|DELETE)/i.test(x.sql)
        ) {
          writes.push(x.sql);
        }
      }
      return real.batch(st);
    },
  } satisfies SqlExecutor;
  return writes;
}

const failEnrol = (s: TestServer, ip: string) =>
  s.call("POST", "/v1/enrol", {
    body: { code: "ZZZZ-ZZZZ-ZZZZ", deviceName: "x" },
    ip,
  });

describe("failed-enrol rate limit write cost", () => {
  it("writes at most one rate_limits row per IP per window, however many attempts", async () => {
    const s = await createTestServer();
    const writes = spyRateLimitWrites(s);
    for (let i = 0; i < 100; i++) await failEnrol(s, "1.1.1.1");
    expect(writes.length).toBeLessThanOrEqual(1);
    expect(
      (
        s.db.prepare("SELECT count(*) n FROM rate_limits").get() as {
          n: number;
        }
      ).n,
    ).toBeLessThanOrEqual(1);
    // still limited
    expect((await failEnrol(s, "1.1.1.1")).status).toBe(429);
  });

  it("does not write at all for failures spread over many IPs below the limit", async () => {
    const s = await createTestServer();
    const writes = spyRateLimitWrites(s);
    for (let i = 0; i < 200; i++)
      await failEnrol(s, `10.0.${i >> 8}.${i & 255}`);
    expect(writes).toEqual([]);
  });

  it("shares the block across isolates through the one marker row", async () => {
    const s = await createTestServer();
    for (let i = 0; i < 10; i++) await failEnrol(s, "1.1.1.1");
    // a second isolate (fresh memory) on the same database still sees the block
    s.deps.enrolGuard = new FailedAttemptGuard(); // a fresh isolate: empty memory
    const fresh = await s.call("POST", "/v1/enrol", {
      body: { code: "ZZZZ-ZZZZ-ZZZZ", deviceName: "x" },
      ip: "1.1.1.1",
    });
    expect(fresh.status).toBe(429);
  });

  it("is pruned by the snapshot run", async () => {
    const s = await createTestServer();
    for (let i = 0; i < 10; i++) await failEnrol(s, "1.1.1.1");
    expect(
      (
        s.db.prepare("SELECT count(*) n FROM rate_limits").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    await runSnapshots(s.executor, new MemoryStore(), T0 + 2 * 86_400_000);
    expect(
      (
        s.db.prepare("SELECT count(*) n FROM rate_limits").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
  });
});

describe("device-code limit is atomic", () => {
  it("lets exactly the limit through under concurrent requests", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        s.call("POST", "/v1/devices/code", { token: a.token }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(7);
  });
});

describe("escaped push size", () => {
  it("refuses a body whose re-encoded parameter would exceed the D1 value limit, with 413", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    // ~1.0 MB of backslashes: valid, under the 1 MiB body cap, but escaped
    // again as a JSON string it is about twice as large.
    const pairs = "\\\\".repeat(510_000);
    const body = `{"formatVersion":1,"cursor":"0","push":[{"tbl":"payees","publicId":"${id(1)}","hlc":"${hlc(T0)}","deleted":false,"payload":{"x":"${pairs}"}}]}`;
    expect(body.length).toBeLessThan(1_048_576);
    const res = await s.call("POST", "/v1/sync", {
      token: a.token,
      rawBody: body,
    });
    expect(res.status).toBe(413);
    expect(res.body.error).toBe("body_too_large");
    expect(s.db.prepare("SELECT count(*) n FROM changes").get()).toEqual({
      n: 0,
    });
    expect(MAX_PUSH_PARAM_BYTES).toBeLessThan(2_000_000);
  });
});
