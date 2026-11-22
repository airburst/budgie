import { describe, expect, it } from "vitest";
import { createTestServer } from "./helpers";
import { env, hlc, id, sync, T0 } from "./sync-helpers";

const row = (s: Awaited<ReturnType<typeof createTestServer>>, n: number) =>
  s.db
    .prepare("SELECT * FROM changes WHERE public_id = ? ORDER BY user_id, tbl")
    .all(id(n)) as Record<string, unknown>[];

describe("POST /v1/sync: authentication", () => {
  it("rejects a missing, malformed and unknown token with bad_token", async () => {
    const s = await createTestServer();
    await s.enrolDevice("alice");
    for (const headers of [undefined, "Basic abc", "Bearer ", "Bearer nope"]) {
      const res = await s.call("POST", "/v1/sync", {
        body: { formatVersion: 1, cursor: "0", push: [] },
        ...(headers ? { token: headers.replace("Bearer ", "") } : {}),
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("bad_token");
    }
  });

  it("rejects a revoked device with revoked", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    s.db
      .prepare("UPDATE devices SET revoked_at = 1 WHERE id = ?")
      .run(a.deviceId);
    const res = await sync(s, a.token);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("revoked");
  });

  it("takes user and device from the token, ignoring ids in the body", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const b = await s.enrolDevice("bob");
    const res = await s.call("POST", "/v1/sync", {
      token: a.token,
      body: {
        formatVersion: 1,
        cursor: "0",
        userId: b.userId,
        deviceId: b.deviceId,
        push: [env("payees", 1, hlc(T0))],
      },
    });
    expect(res.status).toBe(200);
    const [r] = row(s, 1);
    expect(r).toMatchObject({ user_id: a.userId, device_id: a.deviceId });
  });
});

describe("POST /v1/sync: push", () => {
  it("stores accepted envelopes with one shared, increasing seq per request", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const r1 = await sync(s, a.token, [
      env("payees", 1, hlc(T0)),
      env("accounts", 2, hlc(T0)),
    ]);
    expect(r1.status).toBe(200);
    expect(r1.body.rejected).toEqual([]);
    const r2 = await sync(s, a.token, [env("payees", 3, hlc(T0))]);
    expect(r2.status).toBe(200);
    const seqOf = (n: number) => (row(s, n)[0] as { seq: number }).seq;
    expect(seqOf(1)).toBe(seqOf(2));
    expect(seqOf(3)).toBeGreaterThan(seqOf(1));
  });

  it("stores the payload byte for byte", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const payload = `{ "publicId" : "${id(1)}",\n  "amount": 1.0, "n": 1e2, "t": "caf\\u00e9 \\"q\\"", "z": -0.0,"k":[1, 2 ] }`;
    const body = `{"formatVersion":1,"cursor":"0","push":[{"tbl":"payees","publicId":"${id(1)}","hlc":"${hlc(T0)}","deleted":false,"payload":${payload}}]}`;
    const res = await s.call("POST", "/v1/sync", {
      token: a.token,
      rawBody: body,
    });
    expect(res.status).toBe(200);
    expect((row(s, 1)[0] as { payload: string }).payload).toBe(payload);
    // and a second device receives the same text back
    const b = await s.enrolDevice("alice", "other");
    const pulled = await sync(s, b.token);
    expect(pulled.text).toContain(`"payload":${payload}`);
  });

  it("stores a row only when its hlc is higher; lower or equal is stale", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    await sync(s, a.token, [
      env("payees", 1, hlc(T0, 5), { payload: { v: "new" } }),
    ]);
    for (const h of [hlc(T0, 5), hlc(T0, 4), hlc(T0 - 1000, 9)]) {
      const res = await sync(s, a.token, [
        env("payees", 1, h, { payload: { v: "old" } }),
      ]);
      expect(res.body.rejected).toEqual([
        { tbl: "payees", publicId: id(1), reason: "stale" },
      ]);
    }
    expect(JSON.parse((row(s, 1)[0] as { payload: string }).payload)).toEqual({
      v: "new",
    });
    const up = await sync(s, a.token, [
      env("payees", 1, hlc(T0, 6), { payload: { v: "newer" } }),
    ]);
    expect(up.body.rejected).toEqual([]);
    expect(JSON.parse((row(s, 1)[0] as { payload: string }).payload)).toEqual({
      v: "newer",
    });
  });

  it("breaks an hlc tie on counter and device id by string order", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const lo = "0000000a-0000-4000-8000-000000000000";
    const hi = "ffffffff-0000-4000-8000-000000000000";
    await sync(s, a.token, [env("payees", 1, hlc(T0, 0, lo))]);
    const res = await sync(s, a.token, [env("payees", 1, hlc(T0, 0, hi))]);
    expect(res.body.rejected).toEqual([]);
    const back = await sync(s, a.token, [env("payees", 1, hlc(T0, 0, lo))]);
    expect(back.body.rejected).toHaveLength(1);
  });

  it("delete then higher undelete leaves the row live; the reverse leaves it deleted", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    await sync(s, a.token, [env("payees", 1, hlc(T0, 1), { deleted: true })]);
    await sync(s, a.token, [env("payees", 1, hlc(T0, 2), { deleted: false })]);
    expect((row(s, 1)[0] as { deleted: number }).deleted).toBe(0);

    await sync(s, a.token, [env("payees", 2, hlc(T0, 1), { deleted: false })]);
    await sync(s, a.token, [env("payees", 2, hlc(T0, 2), { deleted: true })]);
    expect((row(s, 2)[0] as { deleted: number }).deleted).toBe(1);
    // an older undelete after the delete is stale
    const late = await sync(s, a.token, [
      env("payees", 2, hlc(T0, 1), { deleted: false }),
    ]);
    expect(late.body.rejected[0].reason).toBe("stale");
    expect((row(s, 2)[0] as { deleted: number }).deleted).toBe(1);
  });

  it("rejects an hlc more than 5 minutes ahead as drift and applies the rest", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const res = await sync(s, a.token, [
      env("payees", 1, hlc(T0 + 300_000)), // exactly at the limit: accepted
      env("payees", 2, hlc(T0 + 300_001)),
      env("payees", 3, hlc(T0 - 60_000)),
    ]);
    expect(res.status).toBe(200);
    expect(res.body.rejected).toEqual([
      { tbl: "payees", publicId: id(2), reason: "drift" },
    ]);
    expect(row(s, 1)).toHaveLength(1);
    expect(row(s, 2)).toHaveLength(0);
    expect(row(s, 3)).toHaveLength(1);
    // once the server clock catches up the same hlc is accepted
    s.clock.now += 2000;
    const again = await sync(s, a.token, [env("payees", 2, hlc(T0 + 300_001))]);
    expect(again.body.rejected).toEqual([]);
  });

  it("keeps users separate even with the same tbl and publicId", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const b = await s.enrolDevice("bob");
    await sync(s, a.token, [
      env("payees", 1, hlc(T0, 9), { payload: { owner: "alice" } }),
    ]);
    // bob's lower hlc is not stale against alice's row
    const res = await sync(s, b.token, [
      env("payees", 1, hlc(T0, 1), { payload: { owner: "bob" } }),
    ]);
    expect(res.body.rejected).toEqual([]);
    expect(res.body.pull).toEqual([]); // bob never sees alice's row
    const rows = row(s, 1) as { user_id: string; payload: string }[];
    expect(rows).toHaveLength(2);
    expect(
      JSON.parse(rows.find((r) => r.user_id === a.userId)!.payload).owner,
    ).toBe("alice");
    expect(
      JSON.parse(rows.find((r) => r.user_id === b.userId)!.payload).owner,
    ).toBe("bob");
  });

  it("accepts a newer formatVersion, raises the stored maximum, and refuses older ones", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const b = await s.enrolDevice("alice", "old app");
    const up = await sync(s, a.token, [env("payees", 1, hlc(T0))], "0", 7);
    expect(up.status).toBe(200);
    expect(up.body.formatVersion).toBe(7);
    const old = await sync(s, b.token, [env("payees", 2, hlc(T0))], "0", 1);
    expect(old.status).toBe(409);
    expect(old.body).toMatchObject({
      error: "format_too_old",
      formatVersion: 7,
    });
    expect(row(s, 2)).toHaveLength(0);
  });

  it("refuses malformed requests whole, writing nothing", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const good = env("payees", 1, hlc(T0));
    const cases: unknown[] = [
      { cursor: "0", push: [] },
      { formatVersion: 0, cursor: "0", push: [] },
      { formatVersion: 1.5, cursor: "0", push: [] },
      { formatVersion: 1, push: [] },
      { formatVersion: 1, cursor: "0" },
      { formatVersion: 1, cursor: "0", push: [good, { ...good }] }, // duplicate
      { formatVersion: 1, cursor: "0", push: [good, { ...good, tbl: "nope" }] },
      {
        formatVersion: 1,
        cursor: "0",
        push: [good, { ...good, publicId: id(1).toUpperCase() }],
      },
      { formatVersion: 1, cursor: "0", push: [good, { ...good, hlc: "x" }] },
      { formatVersion: 1, cursor: "0", push: [good, { ...good, deleted: 0 }] },
      {
        formatVersion: 1,
        cursor: "0",
        push: [good, { ...good, payload: null }],
      },
      { formatVersion: 1, cursor: "0", push: [good, { ...good, payload: [] }] },
      { formatVersion: 1, cursor: "garbage", push: [] },
      { formatVersion: 1, cursor: "1:x", push: [] },
      [],
    ];
    for (const body of cases) {
      const res = await s.call("POST", "/v1/sync", { token: a.token, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe("bad_request");
    }
    const notJson = await s.call("POST", "/v1/sync", {
      token: a.token,
      rawBody: "{",
    });
    expect(notJson.status).toBe(400);
    expect(s.db.prepare("SELECT count(*) n FROM changes").get()).toEqual({
      n: 0,
    });
    expect(
      s.db.prepare("SELECT seq FROM users WHERE id = ?").get(a.userId),
    ).toEqual({ seq: 0 });
  });

  it("returns the standard error body", async () => {
    const s = await createTestServer();
    const res = await s.call("POST", "/v1/sync", { rawBody: "{" });
    expect(Object.keys(res.body).sort()).toEqual(["error", "message"]);
  });
});
