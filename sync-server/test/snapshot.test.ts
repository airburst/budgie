import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePortableData } from "@/services/portable-data";
import { buildSnapshot, COLLECTIONS, runSnapshots } from "../src/snapshot";
import { MemoryStore, snapshotKey } from "../src/store";
import { createTestServer } from "./helpers";
import { env, hlc, id, sync, T0 } from "./sync-helpers";

const DAY = 86_400_000;

function account(n: number, extra: Record<string, unknown> = {}) {
  return {
    publicId: id(n),
    createdAt: "2026-11-01 08:00:00",
    updatedAt: "2026-11-22 10:15:30",
    deletedAt: null,
    name: `Account ${n}`,
    number: null,
    type: "bank",
    balance: 100,
    currency: "GBP",
    notes: null,
    interestRate: null,
    creditLimit: null,
    deleted: false,
    ...extra,
  };
}

async function seed(
  s: Awaited<ReturnType<typeof createTestServer>>,
  userName: string,
  push: unknown[],
) {
  const d = await s.enrolDevice(userName);
  await sync(s, d.token, push);
  return d;
}

describe("collections map", () => {
  it("matches tables.json", () => {
    const tables = JSON.parse(
      readFileSync(new URL("../contract/tables.json", import.meta.url), "utf8"),
    ).tables as { tbl: string; collection: string }[];
    expect(COLLECTIONS).toHaveLength(tables.length);
    for (const t of tables) {
      expect(COLLECTIONS).toContainEqual([t.tbl, t.collection]);
    }
  });
});

describe("runSnapshots", () => {
  it("writes snapshots/<user>/<date>.json for each user with data only", async () => {
    const s = await createTestServer();
    const alice = await seed(s, "alice", [
      env("accounts", 1, hlc(T0), { payload: account(1) }),
    ]);
    const bob = await seed(s, "bob", [
      env("accounts", 2, hlc(T0), { payload: account(2) }),
    ]);
    await s.enrolDevice("carol"); // no data
    const store = new MemoryStore();
    const res = await runSnapshots(s.executor, store, T0);
    expect(res).toMatchObject({
      date: "2026-11-22",
      users: 2,
      written: 2,
      failed: 0,
    });
    expect([...store.objects.keys()].sort()).toEqual(
      [
        snapshotKey(alice.userId, "2026-11-22"),
        snapshotKey(bob.userId, "2026-11-22"),
      ].sort(),
    );
    const size = s.db
      .prepare("SELECT size FROM snapshots WHERE user_id = ?")
      .get(alice.userId) as { size: number };
    expect(size.size).toBe(
      new TextEncoder().encode(
        store.objects.get(snapshotKey(alice.userId, "2026-11-22"))!,
      ).length,
    );
  });

  it("builds a package the portable importer verifies, with pending fields null, preferences {} and deleted rows kept", async () => {
    const s = await createTestServer();
    const d = await seed(s, "alice", [
      env("accounts", 1, hlc(T0), { payload: account(1) }),
      env("accounts", 2, hlc(T0), {
        deleted: true,
        payload: account(2, {
          deleted: true,
          deletedAt: "2026-11-22 09:00:00",
        }),
      }),
      env("payees", 3, hlc(T0), {
        payload: {
          publicId: id(3),
          createdAt: null,
          updatedAt: null,
          deletedAt: null,
          name: "Tesco",
          categoryPublicId: null,
          amount: null,
        },
      }),
    ]);
    const text = (await buildSnapshot(s.executor, d.userId, T0))!;
    const pkg = await parsePortableData(text); // checksum + validation
    expect(pkg.manifest.formatVersion).toBe(1);
    expect(pkg.preferences).toEqual({});
    expect(pkg.accounts).toHaveLength(2);
    for (const a of pkg.accounts) {
      expect(a.pendingReconcileBalance).toBeNull();
      expect(a.pendingReconcileDate).toBeNull();
    }
    expect(pkg.accounts.find((a) => a.publicId === id(2))?.deletedAt).toBe(
      "2026-11-22 09:00:00",
    );
    expect(pkg.payees[0]?.name).toBe("Tesco");
    expect(pkg.transactions).toEqual([]);
  });

  it("verifies even when stored payload text is not canonical JSON", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const payload = `{ "publicId":"${id(1)}", "createdAt":null,"updatedAt":null,"deletedAt":null,\n "name":"caf\\u00e9", "number":null,"type":"bank","balance":1.0,"currency":"GBP","notes":null,"interestRate":1e2,"creditLimit":null,"deleted":false }`;
    const body = `{"formatVersion":1,"cursor":"0","push":[{"tbl":"accounts","publicId":"${id(1)}","hlc":"${hlc(T0)}","deleted":false,"payload":${payload}}]}`;
    expect(
      (await s.call("POST", "/v1/sync", { token: a.token, rawBody: body }))
        .status,
    ).toBe(200);
    const pkg = await parsePortableData(
      (await buildSnapshot(s.executor, a.userId, T0))!,
    );
    expect(pkg.accounts[0]).toMatchObject({
      name: "café",
      balance: 1,
      interestRate: 100,
    });
  });

  it("handles more rows than one chunk", async () => {
    const s = await createTestServer();
    const rows = Array.from({ length: 700 }, (_, i) =>
      env("payees", i + 1, hlc(T0), {
        payload: {
          publicId: id(i + 1),
          createdAt: null,
          updatedAt: null,
          deletedAt: null,
          name: `Payee ${i}`,
          categoryPublicId: null,
          amount: null,
        },
      }),
    );
    const d = await s.enrolDevice("alice");
    for (let i = 0; i < rows.length; i += 350)
      await sync(s, d.token, rows.slice(i, i + 350));
    const pkg = await parsePortableData(
      (await buildSnapshot(s.executor, d.userId, T0))!,
    );
    expect(pkg.payees).toHaveLength(700);
    expect(new Set(pkg.payees.map((p) => p.publicId)).size).toBe(700);
  });

  it("gives a user with no new changes a snapshot every day, and removes ones over 30 days old", async () => {
    const s = await createTestServer();
    const d = await seed(s, "alice", [
      env("accounts", 1, hlc(T0), { payload: account(1) }),
    ]);
    const store = new MemoryStore();
    // 40 daily runs, no changes after the first
    for (let day = 0; day < 40; day++) {
      await runSnapshots(s.executor, store, T0 + day * DAY);
    }
    const dates = [...store.objects.keys()]
      .map((k) => k.split("/")[2]!.replace(".json", ""))
      .sort();
    expect(dates).toHaveLength(30);
    expect(dates[0]).toBe("2026-12-02"); // 29 days before 2026-12-31
    expect(dates.at(-1)).toBe("2026-12-31");
    const indexed = s.db
      .prepare("SELECT count(*) n FROM snapshots WHERE user_id = ?")
      .get(d.userId);
    expect(indexed).toEqual({ n: 30 });
  });

  it("does not let one user's failure stop the others, and logs no payloads", async () => {
    const s = await createTestServer();
    const good = await seed(s, "alice", [
      env("accounts", 1, hlc(T0), { payload: account(1) }),
    ]);
    const bad = await s.enrolDevice("bob");
    s.db
      .prepare(
        "INSERT INTO changes (user_id, tbl, public_id, hlc, deleted, payload, device_id, seq) VALUES (?, 'payees', ?, ?, 0, ?, ?, 1)",
      )
      .run(bad.userId, id(9), hlc(T0), "{not json SECRETPAYLOAD", bad.deviceId);
    const store = new MemoryStore();
    const logs: string[] = [];
    const res = await runSnapshots(s.executor, store, T0, (l) => logs.push(l));
    expect(res).toMatchObject({ users: 2, written: 1, failed: 1 });
    expect(store.objects.has(snapshotKey(good.userId, "2026-11-22"))).toBe(
      true,
    );
    expect(store.objects.has(snapshotKey(bad.userId, "2026-11-22"))).toBe(
      false,
    );
    expect(logs.join()).not.toContain("SECRETPAYLOAD");
    expect(logs.join()).toContain(bad.userId);
  });
});
