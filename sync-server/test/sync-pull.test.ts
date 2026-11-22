import { describe, expect, it } from "vitest";
import { createTestServer } from "./helpers";
import { env, hlc, id, sync, T0 } from "./sync-helpers";

async function twoDevices(pageSize?: number) {
  const s = await createTestServer(pageSize ? { pageSize } : {});
  const a = await s.enrolDevice("alice", "A");
  const b = await s.enrolDevice("alice", "B");
  return { s, a, b };
}

/** Pull every page for a device, returning all entries and the final cursor. */
async function drain(
  s: Awaited<ReturnType<typeof createTestServer>>,
  token: string,
  cursor = "0",
) {
  const entries: { tbl: string; publicId: string; hlc: string }[] = [];
  let pages = 0;
  for (;;) {
    const res = await sync(s, token, [], cursor);
    expect(res.status).toBe(200);
    entries.push(...res.body.pull);
    cursor = res.body.cursor;
    pages++;
    if (!res.body.more) return { entries, cursor, pages };
  }
}

describe("POST /v1/sync: pull", () => {
  it("returns other devices' rows after the cursor, never the caller's own", async () => {
    const { s, a, b } = await twoDevices();
    await sync(s, a.token, [env("payees", 1, hlc(T0))]);
    await sync(s, b.token, [env("payees", 2, hlc(T0))]);
    const forA = await sync(s, a.token);
    expect(forA.body.pull.map((e: { publicId: string }) => e.publicId)).toEqual(
      [id(2)],
    );
    const forB = await sync(s, b.token);
    expect(forB.body.pull.map((e: { publicId: string }) => e.publicId)).toEqual(
      [id(1)],
    );
    // the returned entry is a full envelope with the payload unchanged
    expect(forB.body.pull[0]).toEqual({
      tbl: "payees",
      publicId: id(1),
      hlc: hlc(T0),
      deleted: false,
      payload: { publicId: id(1), name: "row 1" },
    });
  });

  it("does not return a row the caller has since overwritten", async () => {
    const { s, a, b } = await twoDevices();
    await sync(s, a.token, [env("payees", 1, hlc(T0, 1))]);
    await sync(s, b.token, [env("payees", 1, hlc(T0, 2))]);
    expect((await sync(s, b.token)).body.pull).toEqual([]);
    expect((await sync(s, a.token)).body.pull).toHaveLength(1);
  });

  it("returns deleted rows and cursor 0 returns the whole data set", async () => {
    const { s, a, b } = await twoDevices();
    await sync(s, a.token, [
      env("accounts", 1, hlc(T0)),
      env("payees", 2, hlc(T0), { deleted: true }),
      env("budget_transfers", 3, hlc(T0)),
    ]);
    await sync(s, a.token, [env("payees", 4, hlc(T0))]);
    const { entries } = await drain(s, b.token, "0");
    expect(entries.map((e) => e.publicId).sort()).toEqual([
      id(1),
      id(2),
      id(3),
      id(4),
    ]);
    expect(entries.find((e) => e.publicId === id(2))).toMatchObject({
      deleted: true,
    });
  });

  it("orders by (seq, tbl, publicId)", async () => {
    const { s, a, b } = await twoDevices();
    await sync(s, a.token, [
      env("payees", 9, hlc(T0)),
      env("accounts", 5, hlc(T0)),
      env("payees", 3, hlc(T0)),
    ]);
    await sync(s, a.token, [env("accounts", 1, hlc(T0))]);
    const { entries } = await drain(s, b.token);
    expect(entries.map((e) => `${e.tbl}/${e.publicId}`)).toEqual([
      `accounts/${id(5)}`,
      `payees/${id(3)}`,
      `payees/${id(9)}`,
      `accounts/${id(1)}`,
    ]);
  });

  it("pages with more, yielding every row exactly once, including rows that share a seq", async () => {
    const { s, a, b } = await twoDevices(3);
    // 10 rows in one request share one seq; 4 more in a second request
    await sync(
      s,
      a.token,
      Array.from({ length: 10 }, (_, i) => env("payees", i + 1, hlc(T0))),
    );
    await sync(
      s,
      a.token,
      Array.from({ length: 4 }, (_, i) => env("accounts", i + 20, hlc(T0))),
    );
    const first = await sync(s, b.token);
    expect(first.body.pull).toHaveLength(3);
    expect(first.body.more).toBe(true);
    const { entries, pages } = await drain(s, b.token);
    expect(pages).toBe(5);
    expect(entries).toHaveLength(14);
    expect(new Set(entries.map((e) => `${e.tbl}/${e.publicId}`)).size).toBe(14);
  });

  it("is exact at a page boundary (no empty trailing page marked more)", async () => {
    const { s, a, b } = await twoDevices(3);
    await sync(
      s,
      a.token,
      Array.from({ length: 6 }, (_, i) => env("payees", i + 1, hlc(T0))),
    );
    const { entries, pages } = await drain(s, b.token);
    expect(entries).toHaveLength(6);
    expect(pages).toBe(2);
  });

  it("does not lose a row changed between two pages", async () => {
    const { s, a, b } = await twoDevices(2);
    await sync(
      s,
      a.token,
      Array.from({ length: 5 }, (_, i) => env("payees", i + 1, hlc(T0, 1))),
    );
    const p1 = await sync(s, b.token);
    expect(p1.body.more).toBe(true);
    // A rewrites a row B has already received (id 1) and one it has not (id 5)
    await sync(s, a.token, [
      env("payees", 1, hlc(T0, 2), { payload: { v: "again" } }),
      env("payees", 5, hlc(T0, 2), { payload: { v: "again" } }),
    ]);
    const rest = await drain(s, b.token, p1.body.cursor);
    const byId = new Map<string, number>();
    for (const e of [...p1.body.pull, ...rest.entries]) {
      byId.set(e.publicId, (byId.get(e.publicId) ?? 0) + 1);
    }
    // every row seen; the rewritten row that was already delivered shows again
    expect([...byId.keys()].sort()).toEqual([1, 2, 3, 4, 5].map(id));
    expect(byId.get(id(1))).toBe(2);
    const latest = [...p1.body.pull, ...rest.entries].filter(
      (e) => e.publicId === id(5),
    );
    expect(latest.at(-1).hlc).toBe(hlc(T0, 2));
  });

  it("returns an empty page and a stable cursor when there is nothing new", async () => {
    const { s, a, b } = await twoDevices();
    await sync(s, a.token, [env("payees", 1, hlc(T0))]);
    const first = await sync(s, b.token);
    const second = await sync(s, b.token, [], first.body.cursor);
    expect(second.body.pull).toEqual([]);
    expect(second.body.more).toBe(false);
    const third = await sync(s, b.token, [], second.body.cursor);
    expect(third.body.pull).toEqual([]);
  });

  it("works with a push and a pull in the same request", async () => {
    const { s, a, b } = await twoDevices();
    await sync(s, a.token, [env("payees", 1, hlc(T0))]);
    const res = await sync(s, b.token, [env("payees", 2, hlc(T0))]);
    expect(res.body.pull.map((e: { publicId: string }) => e.publicId)).toEqual([
      id(1),
    ]);
    expect(res.body.rejected).toEqual([]);
    // B's push is now visible to A, and A's next cursor skips what A has seen
    const forA = await sync(s, a.token);
    expect(forA.body.pull.map((e: { publicId: string }) => e.publicId)).toEqual(
      [id(2)],
    );
  });

  it("never returns another user's rows", async () => {
    const { s, a, b } = await twoDevices();
    const c = await s.enrolDevice("bob");
    await sync(s, c.token, [env("payees", 1, hlc(T0))]);
    expect((await drain(s, a.token)).entries).toEqual([]);
    expect((await drain(s, b.token)).entries).toEqual([]);
  });

  it("accepts the cursor forms it issues and refuses others", async () => {
    const { s, a, b } = await twoDevices(2);
    await sync(
      s,
      a.token,
      Array.from({ length: 4 }, (_, i) => env("payees", i + 1, hlc(T0))),
    );
    const p1 = await sync(s, b.token);
    expect(p1.body.cursor).toMatch(/^1:\d+:payees:[0-9a-f-]{36}$/);
    const done = await drain(s, b.token);
    expect(done.cursor).toMatch(/^1:\d+$/);
    for (const cursor of [
      "abc",
      "1",
      "1:2:3",
      "1:2:nope:" + id(1),
      "-1:0",
      "1:2:payees:x",
    ]) {
      const res = await sync(s, b.token, [], cursor);
      expect(res.status, cursor).toBe(400);
    }
  });

  it("answers a cursor from another data epoch with data_reset", async () => {
    const { s, a, b } = await twoDevices();
    await sync(s, a.token, [env("payees", 1, hlc(T0))]);
    const res = await sync(s, b.token, [], "2:5");
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("data_reset");
    s.db.prepare("UPDATE users SET data_epoch = 2").run();
    expect((await sync(s, b.token, [], "1:5")).body.error).toBe("data_reset");
    expect((await sync(s, b.token, [], "0")).status).toBe(200);
  });
});
