import { describe, expect, it } from "vitest";
import { adminDeleteUserData } from "../src/admin-ops";
import { runSnapshots } from "../src/snapshot";
import { MemoryStore, snapshotKey } from "../src/store";
import { createTestServer } from "./helpers";
import { env, hlc, id, sync, T0 } from "./sync-helpers";

async function setup() {
  const store = new MemoryStore();
  const s = await createTestServer({ store });
  const a = await s.enrolDevice("alice");
  const a2 = await s.enrolDevice("alice", "second");
  const b = await s.enrolDevice("bob");
  await sync(s, a.token, [
    env("payees", 1, hlc(T0)),
    env("payees", 2, hlc(T0)),
    env("accounts", 3, hlc(T0)),
  ]);
  await sync(s, b.token, [env("payees", 1, hlc(T0))]);
  await runSnapshots(s.executor, store, T0);
  return { s, store, a, a2, b };
}

describe("DELETE /v1/data", () => {
  it("removes the caller's rows and snapshots, keeps user and devices, and returns the counts", async () => {
    const { s, store, a, a2, b } = await setup();
    const res = await s.call("DELETE", "/v1/data", { token: a.token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      deletedRows: 3,
      deletedSnapshots: 1,
      timeTravelRetentionDays: 7,
    });
    const rows = (userId: string) =>
      s.db
        .prepare("SELECT count(*) n FROM changes WHERE user_id = ?")
        .get(userId);
    expect(rows(a.userId)).toEqual({ n: 0 });
    expect(store.objects.has(snapshotKey(a.userId, "2026-11-22"))).toBe(false);
    // user and devices stay, tokens keep working
    expect(
      s.db.prepare("SELECT count(*) n FROM users WHERE id = ?").get(a.userId),
    ).toEqual({ n: 1 });
    expect((await sync(s, a2.token)).status).toBe(200);
    // another user's data and snapshots are untouched
    expect(rows(b.userId)).toEqual({ n: 1 });
    expect(store.objects.has(snapshotKey(b.userId, "2026-11-22"))).toBe(true);
  });

  it("invalidates earlier cursors with data_reset but not cursor 0, and never resets seq", async () => {
    const { s, a, a2 } = await setup();
    const before = await sync(s, a2.token);
    const oldCursor = before.body.cursor as string;
    const seqBefore = (
      s.db.prepare("SELECT seq FROM users WHERE id = ?").get(a.userId) as {
        seq: number;
      }
    ).seq;
    await s.call("DELETE", "/v1/data", { token: a.token });
    const stale = await sync(s, a2.token, [], oldCursor);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe("data_reset");
    const seqAfter = (
      s.db.prepare("SELECT seq FROM users WHERE id = ?").get(a.userId) as {
        seq: number;
      }
    ).seq;
    expect(seqAfter).toBeGreaterThanOrEqual(seqBefore);
    // a later Start works: cursor 0, push again, other device pulls it
    const start = await sync(
      s,
      a.token,
      [env("payees", 7, hlc(T0 + 1000))],
      "0",
    );
    expect(start.status).toBe(200);
    const pulled = await sync(s, a2.token, [], "0");
    expect(
      pulled.body.pull.map((e: { publicId: string }) => e.publicId),
    ).toEqual([id(7)]);
    const next = await sync(s, a2.token, [], pulled.body.cursor);
    expect(next.status).toBe(200);
    const seqRestart = (
      s.db.prepare("SELECT seq FROM users WHERE id = ?").get(a.userId) as {
        seq: number;
      }
    ).seq;
    expect(seqRestart).toBeGreaterThan(seqAfter);
  });

  it("requires a valid token", async () => {
    const { s } = await setup();
    expect((await s.call("DELETE", "/v1/data", {})).status).toBe(401);
  });

  it("is repeatable: a second call deletes nothing", async () => {
    const { s, a } = await setup();
    await s.call("DELETE", "/v1/data", { token: a.token });
    const again = await s.call("DELETE", "/v1/data", { token: a.token });
    expect(again.body).toMatchObject({ deletedRows: 0, deletedSnapshots: 0 });
  });
});

describe("delete-user-data admin function", () => {
  it("deletes data and snapshots, optionally the user and devices too", async () => {
    const { s, store, a, b } = await setup();
    const first = await adminDeleteUserData(s.executor, store, "alice");
    expect(first).toEqual({
      deletedRows: 3,
      deletedSnapshots: 1,
      userRemoved: false,
    });
    expect(
      s.db
        .prepare("SELECT count(*) n FROM devices WHERE user_id = ?")
        .get(a.userId),
    ).toEqual({ n: 2 });

    const second = await adminDeleteUserData(s.executor, store, "alice", {
      removeUser: true,
    });
    expect(second.userRemoved).toBe(true);
    expect(
      s.db.prepare("SELECT count(*) n FROM users WHERE id = ?").get(a.userId),
    ).toEqual({ n: 0 });
    expect(
      s.db
        .prepare("SELECT count(*) n FROM devices WHERE user_id = ?")
        .get(a.userId),
    ).toEqual({ n: 0 });
    expect((await sync(s, a.token)).status).toBe(401);
    // bob untouched
    expect(
      s.db
        .prepare("SELECT count(*) n FROM changes WHERE user_id = ?")
        .get(b.userId),
    ).toEqual({ n: 1 });
    await expect(
      adminDeleteUserData(s.executor, store, "ghost"),
    ).rejects.toThrow(/No user/);
  });
});
