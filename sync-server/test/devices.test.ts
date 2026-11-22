import { describe, expect, it } from "vitest";
import { revokeDevice } from "../src/admin-ops";
import { createTestServer } from "./helpers";
import { env, hlc, sync, T0 } from "./sync-helpers";

describe("GET /v1/devices", () => {
  it("lists the caller's active devices, oldest first, and nobody else's", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice", "First");
    s.clock.now += 60_000;
    const a2 = await s.enrolDevice("alice", "Second");
    await s.enrolDevice("bob", "Bob's");
    const res = await s.call("GET", "/v1/devices", { token: a2.token });
    expect(res.status).toBe(200);
    expect(res.body.devices).toEqual([
      {
        id: a.deviceId,
        name: "First",
        createdAt: new Date(T0).toISOString(),
        lastSeenAt: null,
        current: false,
      },
      {
        id: a2.deviceId,
        name: "Second",
        createdAt: new Date(T0 + 60_000).toISOString(),
        lastSeenAt: new Date(T0 + 60_000).toISOString(),
        current: true,
      },
    ]);
  });

  it("omits revoked devices and rejects bad tokens", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const b = await s.enrolDevice("alice", "B");
    await s.call("DELETE", `/v1/devices/${b.deviceId}`, { token: a.token });
    const res = await s.call("GET", "/v1/devices", { token: a.token });
    expect(res.body.devices).toHaveLength(1);
    expect((await s.call("GET", "/v1/devices", {})).status).toBe(401);
  });
});

describe("last_seen_at", () => {
  it("is updated at most hourly, and only by a write when due", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const seen = () =>
      (
        s.db
          .prepare("SELECT last_seen_at FROM devices WHERE id = ?")
          .get(a.deviceId) as { last_seen_at: number | null }
      ).last_seen_at;
    expect(seen()).toBeNull();
    await sync(s, a.token);
    expect(seen()).toBe(T0);
    s.clock.now += 59 * 60_000;
    await sync(s, a.token);
    expect(seen()).toBe(T0);
    s.clock.now += 2 * 60_000;
    await sync(s, a.token);
    expect(seen()).toBe(s.clock.now);
  });
});

describe("DELETE /v1/devices/:id", () => {
  it("revokes a device of the same user and its token stops working at once", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const b = await s.enrolDevice("alice", "B");
    expect((await sync(s, b.token)).status).toBe(200);
    const res = await s.call("DELETE", `/v1/devices/${b.deviceId}`, {
      token: a.token,
    });
    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    const after = await sync(s, b.token);
    expect(after.status).toBe(401);
    expect(after.body.error).toBe("revoked");
  });

  it("lets a device revoke itself", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const res = await s.call("DELETE", `/v1/devices/${a.deviceId}`, {
      token: a.token,
    });
    expect(res.status).toBe(204);
    expect((await sync(s, a.token)).body.error).toBe("revoked");
  });

  it("returns the same not_found for another user's, unknown and already revoked ids", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const b = await s.enrolDevice("bob");
    const c = await s.enrolDevice("alice", "C");
    await s.call("DELETE", `/v1/devices/${c.deviceId}`, { token: a.token });
    const texts = [];
    for (const id of [
      b.deviceId,
      "11111111-1111-4111-8111-111111111111",
      c.deviceId,
    ]) {
      const r = await s.call("DELETE", `/v1/devices/${id}`, { token: a.token });
      expect(r.status).toBe(404);
      texts.push(r.text);
    }
    expect(new Set(texts).size).toBe(1);
    // bob's device is untouched
    expect((await sync(s, b.token)).status).toBe(200);
  });

  it("rejects a non-UUID id with bad_request", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const r = await s.call("DELETE", "/v1/devices/not-a-uuid", {
      token: a.token,
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("bad_request");
  });
});

describe("revoke-device admin function", () => {
  it("revokes, reports a second call, and fails for an unknown id", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    expect(await revokeDevice(s.executor, a.deviceId, s.deps)).toEqual({
      revoked: true,
    });
    expect((await sync(s, a.token)).body.error).toBe("revoked");
    s.clock.now += 1000;
    expect(await revokeDevice(s.executor, a.deviceId, s.deps)).toEqual({
      revoked: false,
    });
    await expect(revokeDevice(s.executor, "nope", s.deps)).rejects.toThrow(
      /No device/,
    );
    void env;
    void hlc;
  });
});
