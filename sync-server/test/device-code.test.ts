import { describe, expect, it } from "vitest";
import { DEVICE_CODE_TTL_MS } from "../src/devices";
import { createTestServer } from "./helpers";

describe("POST /v1/devices/code", () => {
  it("returns an 8-character code valid for 10 minutes, stored hashed", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const res = await s.call("POST", "/v1/devices/code", { token: a.token });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
    );
    expect(res.body.expiresAt).toBe(
      new Date(s.clock.now + DEVICE_CODE_TTL_MS).toISOString(),
    );
    const dump = JSON.stringify(
      s.db.prepare("SELECT * FROM enrol_codes").all(),
    );
    expect(dump).not.toContain(res.body.code.replace("-", ""));
    expect(
      s.db.prepare("SELECT kind FROM enrol_codes WHERE kind='device'").all(),
    ).toHaveLength(1);
  });

  it("enrols a new device for the same user, once", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const { body } = await s.call("POST", "/v1/devices/code", {
      token: a.token,
    });
    const res = await s.call("POST", "/v1/enrol", {
      body: { code: body.code.toLowerCase(), deviceName: "Phone" },
    });
    expect(res.status).toBe(201);
    expect(res.body.deviceId).not.toBe(a.deviceId);
    const owner = s.db
      .prepare("SELECT user_id FROM devices WHERE id = ?")
      .get(res.body.deviceId) as { user_id: string };
    expect(owner.user_id).toBe(a.userId);
    const again = await s.call("POST", "/v1/enrol", {
      body: { code: body.code, deviceName: "Phone 2" },
    });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("bad_code");
  });

  it("fails after expiry with the same error as an unknown code", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const { body } = await s.call("POST", "/v1/devices/code", {
      token: a.token,
    });
    s.clock.now += DEVICE_CODE_TTL_MS + 1;
    const expired = await s.call("POST", "/v1/enrol", {
      body: { code: body.code, deviceName: "x" },
    });
    const unknown = await s.call("POST", "/v1/enrol", {
      body: { code: "ZZZZ-ZZZZ", deviceName: "x" },
    });
    expect(expired.status).toBe(400);
    expect(expired.text).toBe(unknown.text);
  });

  it("counts failed device-code attempts in the same per-IP limit", async () => {
    const s = await createTestServer();
    for (let i = 0; i < 10; i++) {
      await s.call("POST", "/v1/enrol", {
        body: { code: "ZZZZ-ZZZZ", deviceName: "x" },
        ip: "9.9.9.9",
      });
    }
    const r = await s.call("POST", "/v1/enrol", {
      body: { code: "ZZZZ-ZZZZ", deviceName: "x" },
      ip: "9.9.9.9",
    });
    expect(r.status).toBe(429);
  });

  it("does not invalidate earlier unexpired codes", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const c1 = (await s.call("POST", "/v1/devices/code", { token: a.token }))
      .body;
    await s.call("POST", "/v1/devices/code", { token: a.token });
    const res = await s.call("POST", "/v1/enrol", {
      body: { code: c1.code, deviceName: "x" },
    });
    expect(res.status).toBe(201);
  });

  it("never reissues a stored code", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const queue = ["AAAA-AAAA", "AAAA-AAAA", "BBBB-BBBB"];
    s.deps.generateCode = () => queue.shift()!;
    // device code generator is injected via deps for tests
    const one = await s.call("POST", "/v1/devices/code", { token: a.token });
    const two = await s.call("POST", "/v1/devices/code", { token: a.token });
    expect(one.body.code).toBe("AAAA-AAAA");
    expect(two.body.code).toBe("BBBB-BBBB");
  });

  it("is limited per user and a revoked device cannot request a code", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const b = await s.enrolDevice("bob");
    for (let i = 0; i < 5; i++) {
      expect(
        (await s.call("POST", "/v1/devices/code", { token: a.token })).status,
      ).toBe(201);
    }
    const limited = await s.call("POST", "/v1/devices/code", {
      token: a.token,
    });
    expect(limited.status).toBe(429);
    expect(limited.body.retryAfter).toBeGreaterThan(0);
    expect(
      (await s.call("POST", "/v1/devices/code", { token: b.token })).status,
    ).toBe(201);
    s.db
      .prepare("UPDATE devices SET revoked_at = 1 WHERE id = ?")
      .run(b.deviceId);
    const revoked = await s.call("POST", "/v1/devices/code", {
      token: b.token,
    });
    expect(revoked.status).toBe(401);
    expect(revoked.body.error).toBe("revoked");
    expect((await s.call("POST", "/v1/devices/code", {})).body.error).toBe(
      "bad_token",
    );
  });
});
