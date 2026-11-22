import { describe, expect, it, vi } from "vitest";
import { addUser, INVITE_TTL_MS } from "../src/admin";
import { hashToken } from "../src/crypto";
import { createTestServer } from "./helpers";

describe("POST /v1/enrol", () => {
  it("creates a device, returns the token once, and reports hasData false", async () => {
    const s = await createTestServer();
    const inv = await addUser(s.executor, "alice", s.deps);
    const res = await s.call("POST", "/v1/enrol", {
      body: { code: inv.code, deviceName: "  Mark's iPhone " },
    });
    expect(res.status).toBe(201);
    expect(res.body.hasData).toBe(false);
    expect(res.body.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const dev = s.db.prepare("SELECT * FROM devices").get() as Record<
      string,
      unknown
    >;
    expect(dev).toMatchObject({
      id: res.body.deviceId,
      user_id: inv.userId,
      name: "Mark's iPhone",
      revoked_at: null,
    });
  });

  it("stores only the SHA-256 of the token", async () => {
    const s = await createTestServer();
    const { token } = await s.enrolDevice("alice");
    const dump = JSON.stringify(s.db.prepare("SELECT * FROM devices").all());
    expect(dump).not.toContain(token);
    expect(dump).toContain(await hashToken(token));
  });

  it("accepts a lowercase, spaced or look-alike spelling of the code", async () => {
    const s = await createTestServer();
    const inv = await addUser(s.executor, "alice", {
      ...s.deps,
      generateCode: () => "0123-4567-89AB",
    });
    expect(inv.code).toBe("0123-4567-89AB");
    const res = await s.call("POST", "/v1/enrol", {
      body: { code: "o123 4567 89ab", deviceName: "d" },
    });
    expect(res.status).toBe(201);
  });

  it("reports hasData true when the user already holds rows", async () => {
    const s = await createTestServer();
    const first = await s.enrolDevice("alice");
    s.db
      .prepare(
        "INSERT INTO changes (user_id, tbl, public_id, hlc, deleted, payload, device_id, seq) VALUES (?, 'payees', 'p', 'h', 1, '{}', ?, 1)",
      )
      .run(first.userId, first.deviceId);
    const second = await s.enrolDevice("alice", "Second");
    expect(second.userId).toBe(first.userId);
    const inv = await s.enrolDevice("bob");
    expect(inv.userId).not.toBe(first.userId);
    // hasData comes back in the enrol response itself
    const { newInvite } = await import("../src/admin");
    const again = await newInvite(s.executor, "alice", s.deps);
    const res = await s.call("POST", "/v1/enrol", {
      body: { code: again.code, deviceName: "Third" },
    });
    expect(res.body.hasData).toBe(true);
    const bobInv = await newInvite(s.executor, "bob", s.deps);
    const bobRes = await s.call("POST", "/v1/enrol", {
      body: { code: bobInv.code, deviceName: "B2" },
    });
    expect(bobRes.body.hasData).toBe(false);
  });

  it("is single use", async () => {
    const s = await createTestServer();
    const inv = await addUser(s.executor, "alice", s.deps);
    const body = { code: inv.code, deviceName: "d" };
    expect((await s.call("POST", "/v1/enrol", { body })).status).toBe(201);
    const second = await s.call("POST", "/v1/enrol", { body });
    expect(second.status).toBe(400);
    expect(second.body.error).toBe("bad_code");
    expect(s.db.prepare("SELECT count(*) n FROM devices").get()).toEqual({
      n: 1,
    });
  });

  it("gives the same error for used, expired and unknown codes and creates nothing", async () => {
    const s = await createTestServer();
    const used = await addUser(s.executor, "a", s.deps);
    await s.call("POST", "/v1/enrol", {
      body: { code: used.code, deviceName: "d" },
    });
    const expired = await addUser(s.executor, "b", s.deps);
    s.clock.now += INVITE_TTL_MS + 1;
    const results = [];
    for (const code of [used.code, expired.code, "ZZZZ-ZZZZ-ZZZZ"]) {
      const r = await s.call("POST", "/v1/enrol", {
        body: { code, deviceName: "d" },
      });
      results.push({ status: r.status, error: r.body.error, text: r.text });
    }
    expect(new Set(results.map((r) => r.text)).size).toBe(1);
    expect(results[0]).toMatchObject({ status: 400, error: "bad_code" });
    expect(s.db.prepare("SELECT count(*) n FROM devices").get()).toEqual({
      n: 1,
    });
  });

  it("rejects missing or empty fields with bad_request", async () => {
    const s = await createTestServer();
    const inv = await addUser(s.executor, "alice", s.deps);
    for (const body of [
      {},
      { code: inv.code },
      { deviceName: "x" },
      { code: inv.code, deviceName: "   " },
      { code: inv.code, deviceName: "x".repeat(101) },
      { code: 5, deviceName: "x" },
    ]) {
      const r = await s.call("POST", "/v1/enrol", { body });
      expect(r.status).toBe(400);
      expect(r.body.error).toBe("bad_request");
    }
    const bad = await s.call("POST", "/v1/enrol", { rawBody: "{nope" });
    expect(bad.body.error).toBe("bad_request");
    // the invite is still usable
    const ok = await s.call("POST", "/v1/enrol", {
      body: { code: inv.code, deviceName: "x".repeat(100) },
    });
    expect(ok.status).toBe(201);
  });

  it("rate-limits failed attempts per IP, not other IPs, and a window expires", async () => {
    const s = await createTestServer();
    const inv = await addUser(s.executor, "alice", s.deps);
    const fail = () =>
      s.call("POST", "/v1/enrol", {
        body: { code: "AAAA-AAAA-AAAA", deviceName: "d" },
        ip: "1.1.1.1",
      });
    for (let i = 0; i < 10; i++) expect((await fail()).status).toBe(400);
    const limited = await fail();
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("rate_limited");
    expect(limited.body.retryAfter).toBeGreaterThan(0);
    expect(limited.headers.get("retry-after")).toBe(
      String(limited.body.retryAfter),
    );
    // even a valid code is refused from the limited IP...
    const refused = await s.call("POST", "/v1/enrol", {
      body: { code: inv.code, deviceName: "d" },
      ip: "1.1.1.1",
    });
    expect(refused.status).toBe(429);
    // ...but works from another IP
    const other = await s.call("POST", "/v1/enrol", {
      body: { code: inv.code, deviceName: "d" },
      ip: "2.2.2.2",
    });
    expect(other.status).toBe(201);
    // and the window passes
    s.clock.now += 15 * 60_000;
    expect((await fail()).status).toBe(400);
  });

  it("never writes the code to logs", async () => {
    const s = await createTestServer();
    const inv = await addUser(s.executor, "alice", s.deps);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await s.call("POST", "/v1/enrol", {
      body: { code: inv.code, deviceName: "d" },
    });
    await s.call("POST", "/v1/enrol", {
      body: { code: "QQQQ-QQQQ-QQQQ", deviceName: "d" },
    });
    const all = JSON.stringify([...spy.mock.calls, ...log.mock.calls]);
    expect(all).not.toContain(inv.code);
    expect(all).not.toContain("QQQQ");
    spy.mockRestore();
    log.mockRestore();
  });
});
