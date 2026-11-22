import { describe, expect, it } from "vitest";
import { getSnapshot, listSnapshots } from "../src/admin-snapshots";
import { runSnapshots } from "../src/snapshot";
import { MemoryStore, snapshotKey } from "../src/store";
import { createTestServer } from "./helpers";
import { env, hlc, sync, T0 } from "./sync-helpers";

describe("list-snapshots and get-snapshot", () => {
  async function setup() {
    const store = new MemoryStore();
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    await sync(s, a.token, [env("payees", 1, hlc(T0))]);
    await runSnapshots(s.executor, store, T0);
    await runSnapshots(s.executor, store, T0 + 86_400_000);
    return { s, store, a };
  }

  it("lists dates and sizes", async () => {
    const { s, store, a } = await setup();
    const list = await listSnapshots(s.executor, "alice");
    expect(list.map((x) => x.date)).toEqual(["2026-11-22", "2026-11-23"]);
    for (const item of list) {
      const text = store.objects.get(snapshotKey(a.userId, item.date))!;
      expect(item.size).toBe(new TextEncoder().encode(text).length);
    }
    await expect(listSnapshots(s.executor, "ghost")).rejects.toThrow(/No user/);
  });

  it("returns the stored text unchanged", async () => {
    const { s, store, a } = await setup();
    const text = await getSnapshot(s.executor, store, "alice", "2026-11-22");
    expect(text).toBe(store.objects.get(snapshotKey(a.userId, "2026-11-22")));
  });

  it("fails clearly for a missing date, a bad date or an unknown user", async () => {
    const { s, store } = await setup();
    await expect(
      getSnapshot(s.executor, store, "alice", "2026-01-01"),
    ).rejects.toThrow(/No snapshot/);
    await expect(
      getSnapshot(s.executor, store, "alice", "yesterday"),
    ).rejects.toThrow(/date/);
    await expect(
      getSnapshot(s.executor, store, "ghost", "2026-11-22"),
    ).rejects.toThrow(/No user/);
  });
});
