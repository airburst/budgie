// SY-033: every sync outcome becomes a status, recorded in `sync_state`
// (SPEC.md 10.6). HTTP errors come from the real in-process server wherever
// it can produce them.
import type { SyncTransport } from "@/services/sync/engine";
import { syncNow, readSyncStatus } from "@/services/sync/status";
import { createFetchTransport } from "@/services/sync/transport";
import {
  createSyncHarness,
  type SyncHarness,
  type SyncHarnessClient,
} from "@/tests/helpers/sync-harness";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../../sync-server/src/app";
import { MemoryIpLimiter } from "../../../sync-server/src/limits";

let harness: SyncHarness | undefined;
afterEach(() => {
  harness?.close();
  harness = undefined;
});

const setup = async () => {
  harness = await createSyncHarness();
  const [a, b] = harness.clients as [SyncHarnessClient, SyncHarnessClient];
  return { h: harness, a, b };
};

const newAccount = async (client: SyncHarnessClient, name: string) => {
  const [row] = await client.services.accounts.create({
    name,
    number: null,
    type: "bank",
    balance: 100,
    currency: "GBP",
    notes: null,
    interestRate: null,
    creditLimit: null,
    pendingReconcileBalance: null,
    pendingReconcileDate: null,
  });
  if (!row) throw new Error("account not created");
  return { id: row.id, publicId: await client.publicIdOf("accounts", row.id) };
};

const syncState = async (client: SyncHarnessClient) => {
  const [row] = await client.database.query<{
    enabled: number;
    token: string | null;
    cursor: string | null;
    last_synced_at: string | null;
    last_error: string | null;
  }>({
    sql: "SELECT enabled, token, cursor, last_synced_at, last_error FROM sync_state WHERE id = 1",
  });
  if (!row) throw new Error("no sync_state");
  return {
    ...row,
    lastError: row.last_error
      ? (JSON.parse(row.last_error) as Record<string, unknown>)
      : null,
  };
};

const dirtyAccounts = async (client: SyncHarnessClient) =>
  (await client.rows("accounts")).filter((row) => row.dirty).length;

/** Makes the server's database fail every statement with `message`. */
const breakServer = (h: SyncHarness, message: string) => {
  const executor = h.server.deps.executor;
  h.server.deps.executor = {
    batch: () => Promise.reject(new Error(message)),
  };
  return () => {
    h.server.deps.executor = executor;
  };
};

const timestamp = (offsetMs: number) =>
  new Date(vi.getRealSystemTime() + offsetMs)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

describe("completed cycles", () => {
  it("synced: records last_synced_at, clears last_error, and is plain JSON", async () => {
    const { a } = await setup();
    await newAccount(a, "Current");
    const status = await syncNow(a.database, a.deps());
    expect(status).toMatchObject({
      enabled: true,
      state: "synced",
      pendingCount: 0,
      lastError: null,
      retryAfter: null,
      retryAt: null,
    });
    const state = await syncState(a);
    expect(state.last_synced_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(status.lastSyncedAt).toBe(state.last_synced_at);
    expect(state.last_error).toBeNull();
    expect(JSON.parse(JSON.stringify(status))).toEqual(status);
    expect(await readSyncStatus(a.database)).toEqual(status);
  });

  it("drift: its own status, the rejected row stays dirty, the rest is acknowledged", async () => {
    const { a } = await setup();
    const ahead = await newAccount(a, "Ahead");
    await newAccount(a, "Fine");
    await a.database.execute({
      sql: "UPDATE accounts SET notes = 'x', updated_at = ? WHERE id = ?",
      params: [timestamp(10 * 60_000), ahead.id],
    });
    const status = await syncNow(a.database, a.deps());
    expect(status.state).toBe("clock_ahead");
    expect(status.lastError?.code).toBe("drift");
    expect(status.lastSyncedAt).not.toBeNull();
    expect(status.pendingCount).toBe(1);
    expect((await a.row("accounts", ahead.publicId))?.dirty).toBe(true);
    expect((await syncState(a)).lastError).toMatchObject({ state: "clock_ahead" });
  });

  it("does nothing while sync is off", async () => {
    const { a } = await setup();
    await a.database.execute({ sql: "UPDATE sync_state SET enabled = 0" });
    const status = await syncNow(a.database, a.deps());
    expect(status.state).toBe("disabled");
    expect(a.requests).toHaveLength(0);
  });
});

describe("retryable failures", () => {
  it("offline: dirty rows stay dirty, last_synced_at is kept, the next cycle retries", async () => {
    const { a } = await setup();
    await syncNow(a.database, a.deps());
    const lastSynced = (await syncState(a)).last_synced_at;
    await newAccount(a, "Current");
    a.failRequest("before-server");
    const offline = await syncNow(a.database, a.deps());
    expect(offline).toMatchObject({ state: "offline", enabled: true, lastSyncedAt: lastSynced });
    expect(offline.lastError?.code).toBe("network");
    expect(await dirtyAccounts(a)).toBe(1);

    const retried = await syncNow(a.database, a.deps());
    expect(retried).toMatchObject({ state: "synced", lastError: null });
    expect(await dirtyAccounts(a)).toBe(0);
  });

  it("500 server_error: status error, nothing lost, retried next cycle", async () => {
    const { h, a } = await setup();
    await newAccount(a, "Current");
    const restore = breakServer(h, "disk on fire");
    const status = await syncNow(a.database, a.deps());
    expect(status).toMatchObject({ state: "error", enabled: true, retryAfter: null });
    expect(status.lastError?.code).toBe("server_error");
    expect((await syncState(a)).last_synced_at).toBeNull();
    expect(await dirtyAccounts(a)).toBe(1);
    restore();
    expect((await syncNow(a.database, a.deps())).state).toBe("synced");
  });

  it("503 daily_limit: its own status with retryAfter, no request until then", async () => {
    const { h, a } = await setup();
    await newAccount(a, "Current");
    const restore = breakServer(h, "D1_ERROR: daily limit reached");
    const status = await syncNow(a.database, a.deps());
    expect(status.state).toBe("daily_limit");
    expect(status.lastError?.code).toBe("daily_limit");
    expect(status.retryAfter).toBeGreaterThan(0);
    expect(status.retryAt).not.toBeNull();
    expect(await dirtyAccounts(a)).toBe(1);
    restore();

    const sent = a.requests.length;
    expect((await syncNow(a.database, a.deps())).state).toBe("daily_limit");
    expect(a.requests).toHaveLength(sent);
    a.clock.now += ((status.retryAfter ?? 0) + 1) * 1000;
    expect((await syncNow(a.database, a.deps())).state).toBe("synced");
  });

  it("429 rate_limited: status error with retryAfter, honoured", async () => {
    const { h, a } = await setup();
    h.server.deps.ipLimiter = new MemoryIpLimiter(0);
    const status = await syncNow(a.database, a.deps());
    expect(status).toMatchObject({ state: "error", enabled: true });
    expect(status.lastError?.code).toBe("rate_limited");
    expect(status.retryAfter).toBeGreaterThan(0);
    const sent = a.requests.length;
    await syncNow(a.database, a.deps());
    expect(a.requests).toHaveLength(sent);
    delete h.server.deps.ipLimiter;
    a.clock.now += 61_000;
    expect((await syncNow(a.database, a.deps())).state).toBe("synced");
  });

  it("apply error: status error, cursor unchanged, retried next cycle", async () => {
    const { a, b } = await setup();
    await newAccount(b, "From B");
    await syncNow(b.database, b.deps());
    await newAccount(a, "From A");
    const cursor = await a.cursor();
    const corrupt: SyncTransport = async (request, auth) => {
      const response = await a.deps().transport(request, auth);
      return {
        ...response,
        pull: response.pull.map((e) => ({ ...e, hlc: "not an hlc" })),
      };
    };
    const status = await syncNow(a.database, a.deps({ transport: corrupt }));
    expect(status).toMatchObject({ state: "error", enabled: true });
    expect(status.lastError?.code).toBe("invalid_envelope");
    expect(await a.cursor()).toBe(cursor);
    expect(await dirtyAccounts(a)).toBe(1);
    expect((await a.rows("accounts")).map((r) => r.payload.name)).toEqual(["From A"]);

    expect((await syncNow(a.database, a.deps())).state).toBe("synced");
    expect((await a.rows("accounts")).map((r) => r.payload.name).sort()).toEqual(["From A", "From B"]);
  });

  it("push guard: status error naming the problem, nothing sent", async () => {
    const { a } = await setup();
    const account = await newAccount(a, "Current");
    await a.database.execute({
      sql: "UPDATE accounts SET created_at = 'yesterday' WHERE id = ?",
      params: [account.id],
    });
    const status = await syncNow(a.database, a.deps());
    expect(status.state).toBe("error");
    expect(status.lastError).toMatchObject({ code: "invalid_outgoing_envelope" });
    expect(status.lastError?.message).toContain(account.publicId);
    expect(a.requests).toHaveLength(0);
  });
});

describe("failures that stop syncing", () => {
  it("newer format in a pull: update needed, nothing applied, cursor kept; lifts once the app is updated", async () => {
    const { a, b } = await setup();
    await newAccount(b, "From B");
    await syncNow(b.database, b.deps());
    await newAccount(a, "From A");
    const cursor = await a.cursor();
    const newer: SyncTransport = async (request, auth) => ({
      ...(await a.deps().transport(request, auth)),
      formatVersion: 2,
    });
    const status = await syncNow(a.database, a.deps({ transport: newer }));
    expect(status).toMatchObject({ state: "update_needed", enabled: false });
    expect(status.lastError?.code).toBe("format_too_new");
    expect(await a.cursor()).toBe(cursor);
    expect((await a.rows("accounts")).map((r) => r.payload.name)).toEqual(["From A"]);
    expect(await dirtyAccounts(a)).toBe(1);

    // Durable: no request until the app speaks format 2.
    const sent = a.requests.length;
    expect((await syncNow(a.database, a.deps())).state).toBe("update_needed");
    expect((await readSyncStatus(a.database)).state).toBe("update_needed");
    expect(a.requests).toHaveLength(sent);

    const updated = await syncNow(a.database, a.deps({ formatVersion: 2 }));
    expect(updated).toMatchObject({ state: "synced", enabled: true });
    expect((await a.rows("accounts")).map((r) => r.payload.name).sort()).toEqual(["From A", "From B"]);
  });

  it("409 format_too_old: update needed, with the server's version recorded", async () => {
    const { a, b } = await setup();
    await b.sync({ formatVersion: 2 });
    await newAccount(a, "Kept");
    const status = await syncNow(a.database, a.deps());
    expect(status).toMatchObject({ state: "update_needed", enabled: false });
    expect(status.lastError?.code).toBe("format_too_old");
    expect((await syncState(a)).lastError).toMatchObject({ formatVersion: 2 });
    expect(await dirtyAccounts(a)).toBe(1);
  });

  it.each(["revoked", "bad_token"] as const)(
    "401 %s: disconnected, syncing stops for good, local data stays",
    async (code) => {
      const { h, a } = await setup();
      const account = await newAccount(a, "Current");
      await syncNow(a.database, a.deps());
      if (code === "revoked") {
        const res = await h.server.call("DELETE", `/v1/devices/${a.deviceId}`, { token: a.token });
        expect(res.status).toBe(204);
      } else {
        await a.database.execute({ sql: "UPDATE sync_state SET token = 'unknown-token'" });
      }
      await a.database.execute({
        sql: "UPDATE accounts SET notes = 'offline edit' WHERE id = ?",
        params: [account.id],
      });
      const status = await syncNow(a.database, a.deps());
      expect(status).toMatchObject({ state: "disconnected", enabled: false });
      expect(status.lastError?.code).toBe(code);
      expect((await a.row("accounts", account.publicId))?.payload.notes).toBe("offline edit");
      expect(await dirtyAccounts(a)).toBe(1);

      const sent = a.requests.length;
      expect((await syncNow(a.database, a.deps())).state).toBe("disconnected");
      expect(a.requests).toHaveLength(sent);
      expect((await readSyncStatus(a.database)).state).toBe("disconnected");
    },
  );

  it("409 data_reset: cloud data deleted, syncing stops, data and token kept", async () => {
    const { h, b, a } = await setup();
    await newAccount(a, "Current");
    await syncNow(a.database, a.deps());
    await syncNow(b.database, b.deps());
    const res = await h.server.call("DELETE", "/v1/data", { token: b.token });
    expect(res.status).toBe(200);
    const cursor = await a.cursor();

    const status = await syncNow(a.database, a.deps());
    expect(status).toMatchObject({ state: "cloud_data_deleted", enabled: false });
    expect(status.lastError?.code).toBe("data_reset");
    const state = await syncState(a);
    expect(state).toMatchObject({ token: a.token, cursor, enabled: 0 });
    expect(await a.rows("accounts")).toHaveLength(1);
  });
});

describe("fetch transport against the real server", () => {
  it("syncs, then maps a revoked token to disconnected", async () => {
    const { h, a } = await setup();
    const fetchImpl: typeof fetch = (input, init) =>
      handleRequest(new Request(input, init), h.server.deps);
    const transport = createFetchTransport({ fetch: fetchImpl });
    await newAccount(a, "Current");
    expect((await syncNow(a.database, a.deps({ transport }))).state).toBe("synced");
    expect(h.server.db.prepare("SELECT COUNT(*) AS n FROM changes WHERE tbl = 'accounts'").get()).toEqual({ n: 1 });

    await h.server.call("DELETE", `/v1/devices/${a.deviceId}`, { token: a.token });
    const status = await syncNow(a.database, a.deps({ transport }));
    expect(status.state).toBe("disconnected");
    expect(status.lastError?.code).toBe("revoked");
  });
});
