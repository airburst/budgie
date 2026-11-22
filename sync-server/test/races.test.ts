// Interleavings where another request lands between a handler's reads and its
// write batch. The hook runs `action` once, just before the first batch whose
// statements match `when`.
import { describe, expect, it } from "vitest";
import { deleteUserData } from "../src/data";
import type { SqlExecutor, SqlStatement } from "../src/executor";
import { runSnapshots } from "../src/snapshot";
import { MemoryStore, snapshotKey } from "../src/store";
import { createTestServer, type TestServer } from "./helpers";
import { env, hlc, id, sync, T0 } from "./sync-helpers";

function interleave(
  s: TestServer,
  when: (st: SqlStatement[]) => boolean,
  action: () => Promise<void>,
) {
  const real = s.executor;
  let armed = true;
  const wrapped: SqlExecutor = {
    async batch(st) {
      if (armed && when(st)) {
        armed = false;
        await action();
      }
      return real.batch(st);
    },
  };
  s.deps.executor = wrapped;
  return () => {
    s.deps.executor = real;
  };
}

const count = (s: TestServer, sql: string, ...p: unknown[]) =>
  (s.db.prepare(sql).get(...p) as { n: number }).n;

describe("snapshot vs delete-data", () => {
  it("a delete between the put and the end of the run leaves no object and no index row", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("u", "A");
    await sync(s, a.token, [env("accounts", 1, hlc(T0, 0, a.deviceId))]);
    const store = new MemoryStore();
    const put = store.put.bind(store);
    store.put = async (k, v) => {
      await deleteUserData(s.executor, store, a.userId);
      return put(k, v);
    };
    await runSnapshots(s.executor, store, T0);
    expect([...store.objects.keys()]).toEqual([]);
    expect(count(s, "SELECT count(*) n FROM snapshots")).toBe(0);
  });

  it("a delete between reading the rows and indexing the snapshot writes nothing", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("u", "A");
    await sync(s, a.token, [env("accounts", 1, hlc(T0, 0, a.deviceId))]);
    const store = new MemoryStore();
    interleave(
      s,
      (st) => st.some((x) => /INSERT INTO snapshots/.test(x.sql)),
      async () => {
        await deleteUserData(s.executor, store, a.userId);
      },
    );
    await runSnapshots(s.deps.executor, store, T0);
    expect([...store.objects.keys()]).toEqual([]);
    expect(count(s, "SELECT count(*) n FROM snapshots")).toBe(0);
  });

  it("delete-data removes objects that have no index row, by key prefix", async () => {
    const store = new MemoryStore();
    const s = await createTestServer({ store });
    const a = await s.enrolDevice("u", "A");
    const b = await s.enrolDevice("v", "B");
    store.objects.set(snapshotKey(a.userId, "2026-01-01"), "orphan");
    store.objects.set(snapshotKey(b.userId, "2026-01-01"), "keep");
    await s.call("DELETE", "/v1/data", { token: a.token });
    expect([...store.objects.keys()]).toEqual([
      snapshotKey(b.userId, "2026-01-01"),
    ]);
  });
});

describe("sync write batch re-checks epoch and device", () => {
  const isSyncWrite = (st: SqlStatement[]) =>
    st.length >= 4 && /UPDATE users/.test(st[0]!.sql);

  it("a delete-data landing before the write batch rejects the push with data_reset and writes nothing", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("u", "A");
    const b = await s.enrolDevice("u", "B");
    const r1 = await sync(s, b.token, [
      env("accounts", 1, hlc(T0, 0, b.deviceId)),
    ]);
    interleave(s, isSyncWrite, async () => {
      await deleteUserData(s.executor, undefined, a.userId);
    });
    const r2 = await sync(
      s,
      b.token,
      [env("accounts", 2, hlc(T0, 0, b.deviceId))],
      r1.body.cursor,
    );
    expect(r2.status).toBe(409);
    expect(r2.body.error).toBe("data_reset");
    expect(count(s, "SELECT count(*) n FROM changes")).toBe(0);
  });

  it("a revoke landing before the write batch rejects the push with revoked and writes nothing", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("u", "A");
    const b = await s.enrolDevice("u", "B");
    interleave(s, isSyncWrite, async () => {
      await s.executor.batch([
        {
          sql: "UPDATE devices SET revoked_at = 1 WHERE id = ?",
          params: [b.deviceId],
        },
      ]);
    });
    const r = await sync(s, b.token, [
      env("accounts", 1, hlc(T0, 0, b.deviceId)),
    ]);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("revoked");
    expect(count(s, "SELECT count(*) n FROM changes")).toBe(0);
    void a;
  });

  it("a raised format version landing before the write batch gives format_too_old", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("u", "A");
    interleave(s, isSyncWrite, async () => {
      await s.executor.batch([
        {
          sql: "UPDATE users SET max_format_version = 5 WHERE id = ?",
          params: [a.userId],
        },
      ]);
    });
    const r = await sync(s, a.token, [
      env("accounts", 1, hlc(T0, 0, a.deviceId)),
    ]);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("format_too_old");
    expect(count(s, "SELECT count(*) n FROM changes")).toBe(0);
  });

  it("does not pull anything for a device revoked mid-request", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("u", "A");
    const b = await s.enrolDevice("u", "B");
    await sync(s, a.token, [env("accounts", 1, hlc(T0, 0, a.deviceId))]);
    interleave(s, isSyncWrite, async () => {
      await s.executor.batch([
        {
          sql: "UPDATE devices SET revoked_at = 1 WHERE id = ?",
          params: [b.deviceId],
        },
      ]);
    });
    const r = await sync(s, b.token);
    expect(r.status).toBe(401);
    expect(r.text).not.toContain(id(1));
  });
});

describe("other authenticated writes re-check the caller", () => {
  it("device code issue by a device revoked mid-request fails with revoked and stores no code", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("u", "A");
    const before = count(s, "SELECT count(*) n FROM enrol_codes");
    interleave(
      s,
      (st) => st.some((x) => /INSERT INTO enrol_codes/.test(x.sql)),
      async () => {
        await s.executor.batch([
          {
            sql: "UPDATE devices SET revoked_at = 1 WHERE id = ?",
            params: [a.deviceId],
          },
        ]);
      },
    );
    const r = await s.call("POST", "/v1/devices/code", { token: a.token });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("revoked");
    expect(count(s, "SELECT count(*) n FROM enrol_codes")).toBe(before);
  });

  it("delete-data by a device revoked mid-request deletes nothing", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("u", "A");
    await sync(s, a.token, [env("accounts", 1, hlc(T0, 0, a.deviceId))]);
    const epoch = count(s, "SELECT data_epoch n FROM users");
    interleave(
      s,
      (st) => st.some((x) => /DELETE FROM changes/.test(x.sql)),
      async () => {
        await s.executor.batch([
          {
            sql: "UPDATE devices SET revoked_at = 1 WHERE id = ?",
            params: [a.deviceId],
          },
        ]);
      },
    );
    const r = await s.call("DELETE", "/v1/data", { token: a.token });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("revoked");
    expect(count(s, "SELECT count(*) n FROM changes")).toBe(1);
    expect(count(s, "SELECT data_epoch n FROM users")).toBe(epoch);
  });

  it("revoking another device by a caller revoked mid-request revokes nothing", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("u", "A");
    const b = await s.enrolDevice("u", "B");
    interleave(
      s,
      (st) => st.some((x) => /UPDATE devices SET revoked_at/.test(x.sql)),
      async () => {
        await s.executor.batch([
          {
            sql: "UPDATE devices SET revoked_at = 1 WHERE id = ?",
            params: [a.deviceId],
          },
        ]);
      },
    );
    const r = await s.call("DELETE", `/v1/devices/${b.deviceId}`, {
      token: a.token,
    });
    expect(r.status).toBe(401);
    expect(
      (
        s.db
          .prepare("SELECT revoked_at FROM devices WHERE id = ?")
          .get(b.deviceId) as {
          revoked_at: number | null;
        }
      ).revoked_at,
    ).toBeNull();
  });
});
