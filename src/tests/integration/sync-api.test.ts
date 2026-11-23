// SY-035: the sync methods of the application API, over a real in-process sync
// server (sync-server/test/helpers) and a migrated in-memory Budgie database.
// The transport and server client are thin adapters over `server.call`, so
// every request is visible in `requests`.
import { createBrowserApplicationApi } from "@/platform/browser-api";
import { createUnsupportedSyncApi, getSyncApi } from "@/platform/sync-api";
import { createAccountService } from "@/services/accounts";
import { createTransactionService } from "@/services/transactions";
import { createSyncApi } from "@/services/sync/api";
import type { SyncApi } from "@/services/sync/api-types";
import type { SyncTransport } from "@/services/sync/engine";
import { SyncHttpError, SyncNetworkError } from "@/services/sync/errors";
import { startSync } from "@/services/sync/start";
import type { SyncServerClient } from "@/services/sync/transport";
import { createCapabilityDatabase } from "@/tests/helpers/portable-fixture";
import type { BrowserDatabase } from "@/web/db/browser-database";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addUser } from "../../../sync-server/src/admin";
import {
  createTestServer,
  type TestServer,
} from "../../../sync-server/test/helpers";

type Device = ReturnType<typeof makeDevice>;

beforeAll(() => {
  vi.stubGlobal("__APP_VERSION__", "9.9.9");
});

const closers: Array<() => void> = [];
afterEach(() => {
  while (closers.length) closers.pop()?.();
});

const makeDevice = (
  server: TestServer,
  options: { hasLock?: () => boolean } = {},
) => {
  const { database, close } = createCapabilityDatabase();
  closers.push(close);
  /** `METHOD path` of every request this device sent. */
  const requests: string[] = [];
  const control = { offline: false, inFlight: 0, maxInFlight: 0, delayMs: 0 };

  const call = async (
    method: string,
    path: string,
    init: { token?: string; body?: unknown },
    ok: number,
  ) => {
    requests.push(`${method} ${path}`);
    control.inFlight++;
    control.maxInFlight = Math.max(control.maxInFlight, control.inFlight);
    try {
      if (control.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, control.delayMs));
      }
      if (control.offline) throw new SyncNetworkError("offline");
      const response = await server.call(method, path, init);
      if (response.status !== ok) {
        throw new SyncHttpError(
          response.status,
          response.body?.error ?? "unknown",
          response.body?.retryAfter ?? null,
          response.body ?? {},
        );
      }
      return response.body;
    } finally {
      control.inFlight--;
    }
  };

  const transport: SyncTransport = (request, auth) =>
    call("POST", "/v1/sync", { token: auth.token, body: request }, 200);
  const client: SyncServerClient = {
    enrol: (request) => call("POST", "/v1/enrol", { body: request }, 201),
    createDeviceCode: (auth) =>
      call("POST", "/v1/devices/code", { token: auth.token, body: {} }, 201),
    listDevices: async (auth) =>
      (await call("GET", "/v1/devices", { token: auth.token }, 200)).devices,
    revokeDevice: async (auth, id) => {
      await call("DELETE", `/v1/devices/${id}`, { token: auth.token }, 204);
    },
    deleteData: (auth) =>
      call("DELETE", "/v1/data", { token: auth.token }, 200),
  };

  let lock = options.hasLock ?? (() => true);
  const api: SyncApi = createSyncApi({
    database,
    transport,
    server: client,
    serverUrl: "https://sync.test",
    hasLock: () => lock(),
    appVersion: "9.9.9",
    now: () => server.clock.now,
  });
  return {
    api,
    database,
    requests,
    control,
    setLock: (value: boolean) => {
      lock = () => value;
    },
    accounts: createAccountService(database),
    state: async () =>
      (
        await database.query<{
          device_id: string | null;
          token: string | null;
          cursor: string | null;
          enabled: number;
          consent_at: string | null;
          consent_app_version: string | null;
        }>({ sql: "SELECT * FROM sync_state WHERE id = 1" })
      )[0]!,
  };
};

const account = (name: string) => ({
  name,
  number: null,
  type: "bank" as const,
  balance: 100,
  currency: "GBP",
  notes: null,
  interestRate: null,
  creditLimit: null,
  pendingReconcileBalance: null,
  pendingReconcileDate: null,
});

const newServer = async () => {
  const server = await createTestServer();
  // Row timestamps come from SQLite's real clock: keep the server's in step.
  server.clock.now = vi.getRealSystemTime();
  const invite = async () => (await addUser(server.executor, "mark", server.deps)).code;
  return { server, invite };
};

const ok = <T extends { ok: boolean }>(result: T) => {
  expect(result.ok).toBe(true);
  return result as Extract<T, { ok: true }>;
};

const fail = <T extends { ok: boolean }>(result: T, reason: string) => {
  expect(result).toMatchObject({ ok: false, reason });
};

/** Enrols, with consent, and starts: the first device of a user. */
const enrolAndStart = async (device: Device, code: string) => {
  ok(await device.api.enrolSync({ code, deviceName: "Laptop", consent: true }));
  ok(await device.api.startSync());
};

const accountNames = async (device: Device) =>
  (await device.accounts.getAll()).map((a) => a.name).sort();

describe("enrol and consent", () => {
  it("sends nothing to the server before enrol is called with consent", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await invite();

    expect(await device.api.getSyncStatus()).toMatchObject({ state: "disabled" });
    fail(
      await device.api.enrolSync({ code: "ABCD-EFGH", deviceName: "x", consent: false }),
      "consent_required",
    );
    fail(await device.api.startSync(), "not_enrolled");
    fail(await device.api.joinSync(), "not_enrolled");
    fail(await device.api.syncNow(), "not_enrolled");
    fail(await device.api.enableSync(), "not_enrolled");
    fail(await device.api.signOutSync({ force: true }), "not_enrolled");
    fail(await device.api.deleteSyncCloudData(), "not_enrolled");
    fail(await device.api.listSyncDevices(), "not_enrolled");
    fail(await device.api.createSyncDeviceCode(), "not_enrolled");
    fail(await device.api.revokeSyncDevice("x"), "not_enrolled");
    expect(device.requests).toEqual([]);
    expect((await device.state()).token).toBeNull();
  });

  it("refuses consent that is not literally true", async () => {
    const { server } = await newServer();
    const device = makeDevice(server);
    fail(
      await device.api.enrolSync({
        code: "ABCD-EFGH",
        deviceName: "x",
        consent: undefined as unknown as boolean,
      }),
      "consent_required",
    );
    expect(device.requests).toEqual([]);
  });

  it("stores device id, token, consent date and app version, and reports hasData", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    const result = ok(
      await device.api.enrolSync({
        code: await invite(),
        deviceName: "  Laptop ",
        consent: true,
      }),
    );
    expect(result.hasData).toBe(false);

    const state = await device.state();
    expect(state.device_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.token).toBeTruthy();
    expect(state.consent_at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(state.consent_app_version).toBe("9.9.9");
    expect(state.enabled).toBe(0);
    expect(state.cursor).toBeNull();

    const status = await device.api.getSyncStatus();
    expect(status).toMatchObject({
      enrolled: true,
      consented: true,
      started: false,
      enabled: false,
      state: "disabled",
      supported: true,
    });
    const devices = ok(await device.api.listSyncDevices()).devices;
    expect(devices.map((d) => d.name)).toEqual(["Laptop"]);
  });

  it("a wrong code gives bad_code and changes nothing", async () => {
    const { server } = await newServer();
    const device = makeDevice(server);
    fail(
      await device.api.enrolSync({ code: "AAAA-BBBB", deviceName: "x", consent: true }),
      "bad_code",
    );
    const state = await device.state();
    expect(state.device_id).toBeNull();
    expect(state.consent_at).toBeNull();
  });

  it("rejects an empty device name locally", async () => {
    const { server } = await newServer();
    const device = makeDevice(server);
    fail(
      await device.api.enrolSync({ code: "AAAA-BBBB", deviceName: "  ", consent: true }),
      "invalid_input",
    );
    expect(device.requests).toEqual([]);
  });

  it("reports offline when enrol cannot reach the server, changing nothing", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    device.control.offline = true;
    fail(
      await device.api.enrolSync({ code: await invite(), deviceName: "x", consent: true }),
      "offline",
    );
    expect((await device.state()).device_id).toBeNull();
  });

  it("refuses to enrol again while sync is on", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());
    fail(
      await device.api.enrolSync({ code: "AAAA-BBBB", deviceName: "x", consent: true }),
      "already_enrolled",
    );
  });
});

describe("start and join", () => {
  it("Start uploads and reports a synced status", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await device.accounts.create(account("Current"));
    ok(
      await device.api.enrolSync({ code: await invite(), deviceName: "A", consent: true }),
    );
    const { status } = ok(await device.api.startSync());
    expect(status).toMatchObject({
      enabled: true,
      state: "synced",
      pendingCount: 0,
      started: true,
    });
    expect(status.lastSyncedAt).toMatch(/^\d{4}-/);
    fail(await device.api.startSync(), "already_started");
  });

  it("Start does not run without recorded consent, even with a token", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    const enrolled = await server.call("POST", "/v1/enrol", {
      body: { code: await invite(), deviceName: "A" },
    });
    await device.database.execute({
      sql: "UPDATE sync_state SET device_id = ?, token = ? WHERE id = 1",
      params: [enrolled.body.deviceId, enrolled.body.token],
    });
    fail(await device.api.startSync(), "consent_required");
    fail(await device.api.joinSync(), "consent_required");
    await expect(
      startSync(device.database, {
        transport: (r, a) => server
          .call("POST", "/v1/sync", { token: a.token, body: r })
          .then((res) => res.body),
        now: () => server.clock.now,
      }),
    ).rejects.toMatchObject({ code: "consent_required" });
    expect(device.requests).toEqual([]);
    expect((await device.state()).cursor).toBeNull();
  });

  it("a second device joins with a device code and replaces its data; Start is refused", async () => {
    const { server, invite } = await newServer();
    const a = makeDevice(server);
    await a.accounts.create(account("From A"));
    await enrolAndStart(a, await invite());

    const b = makeDevice(server);
    await b.accounts.create(account("Only on B"));
    const { code } = ok(await a.api.createSyncDeviceCode());
    const enrol = ok(
      await b.api.enrolSync({ code, deviceName: "B", consent: true }),
    );
    expect(enrol.hasData).toBe(true);

    fail(await b.api.startSync(), "server_has_data");
    expect(await accountNames(b)).toEqual(["Only on B"]);

    const joined = ok(await b.api.joinSync());
    expect(joined.appliedRows).toBeGreaterThan(0);
    expect(joined.status).toMatchObject({ enabled: true, state: "synced" });
    expect(await accountNames(b)).toEqual(["From A"]);
    // Join is followed by a normal cycle: b now syncs by itself.
    await b.accounts.create(account("Later on B"));
    ok(await b.api.syncNow());
    ok(await a.api.syncNow());
    expect(await accountNames(a)).toEqual(["From A", "Later on B"]);
  });

  it("Join is refused when the server holds nothing, leaving local data alone", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await device.accounts.create(account("Mine"));
    ok(
      await device.api.enrolSync({ code: await invite(), deviceName: "A", consent: true }),
    );
    fail(await device.api.joinSync(), "server_empty");
    expect(await accountNames(device)).toEqual(["Mine"]);
    expect((await device.state()).cursor).toBeNull();
  });

  it("a failed Join (offline) changes nothing", async () => {
    const { server, invite } = await newServer();
    const a = makeDevice(server);
    await enrolAndStart(a, await invite());
    const b = makeDevice(server);
    await b.accounts.create(account("Keep me"));
    const { code } = ok(await a.api.createSyncDeviceCode());
    ok(await b.api.enrolSync({ code, deviceName: "B", consent: true }));
    b.control.offline = true;
    fail(await b.api.joinSync(), "offline");
    expect(await accountNames(b)).toEqual(["Keep me"]);
  });
});

describe("status", () => {
  it("reports pending, then synced, and offline with the error", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());

    await device.accounts.create(account("New"));
    expect(await device.api.getSyncStatus()).toMatchObject({
      state: "pending",
    });
    expect((await device.api.getSyncStatus()).pendingCount).toBeGreaterThan(0);

    device.control.offline = true;
    const offline = ok(await device.api.syncNow());
    expect(offline.status).toMatchObject({
      state: "offline",
      lastError: { code: "network" },
    });
    expect(offline.status.pendingCount).toBeGreaterThan(0);

    device.control.offline = false;
    const synced = ok(await device.api.syncNow());
    expect(synced.status).toMatchObject({
      state: "synced",
      pendingCount: 0,
      lastError: null,
    });
    expect(synced.status.lastSyncedAt).toMatch(/^\d{4}-/);
  });

  it("lists accounts needing reconciliation review", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());
    const [created] = await device.accounts.create(account("Reconciled"));
    const accountId = created!.id;
    await createTransactionService(device.database).create({
      accountId,
      categoryId: null,
      date: "2026-03-01",
      payee: "Shop",
      amount: 10,
      notes: null,
      cleared: true,
    });
    await device.database.execute({
      sql: "UPDATE transactions SET reconciled = 1",
    });
    // A checkpoint of 100 does not match 100 + 10.
    await device.database.execute({
      sql: "INSERT INTO account_reconciliations (account_id, date, balance) VALUES (?, '2026-03-02', 100)",
      params: [accountId],
    });
    const status = await device.api.getSyncStatus();
    expect(status.reconciliationReview).toHaveLength(1);
  });

  it("is readable without the lock", async () => {
    const { server } = await newServer();
    const device = makeDevice(server, { hasLock: () => false });
    expect(await device.api.getSyncStatus()).toMatchObject({
      state: "disabled",
      enabled: false,
      pendingCount: 0,
      lastSyncedAt: null,
      lastError: null,
      reconciliationReview: [],
    });
  });
});

describe("instance lock", () => {
  it("refuses every mutating method without the lock and sends nothing", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server, { hasLock: () => false });
    const code = await invite();
    const results = await Promise.all([
      device.api.enrolSync({ code, deviceName: "x", consent: true }),
      device.api.startSync(),
      device.api.joinSync(),
      device.api.syncNow(),
      device.api.disableSync(),
      device.api.enableSync(),
      device.api.signOutSync({ force: true }),
      device.api.deleteSyncCloudData(),
      device.api.listSyncDevices(),
      device.api.revokeSyncDevice("x"),
      device.api.createSyncDeviceCode(),
    ]);
    for (const result of results) fail(result, "not_active_tab");
    expect(device.requests).toEqual([]);
    expect((await device.state()).device_id).toBeNull();
  });

  it("follows the lock as it is lost", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());
    device.setLock(false);
    fail(await device.api.syncNow(), "not_active_tab");
    device.setLock(true);
    ok(await device.api.syncNow());
  });

  it("the browser API refuses sync changes unless given a lock", async () => {
    const { database } = createCapabilityDatabase();
    const api = createBrowserApplicationApi(database as unknown as BrowserDatabase);
    fail(await api.syncNow(), "not_active_tab");
    expect(await api.getSyncStatus()).toMatchObject({ state: "disabled" });
    const locked = createBrowserApplicationApi(
      database as unknown as BrowserDatabase,
      { hasLock: () => true },
    );
    fail(await locked.syncNow(), "not_enrolled");
    // No sync server is configured in tests: enrol cannot reach anything.
    fail(
      await locked.enrolSync({ code: "AAAA-BBBB", deviceName: "x", consent: true }),
      "not_configured",
    );
  });
});

describe("serialisation", () => {
  it("never runs two operations at once and shares a waiting cycle", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());
    await device.accounts.create(account("x"));
    device.requests.length = 0;
    device.control.delayMs = 5;
    device.control.maxInFlight = 0;

    const results = await Promise.all([
      device.api.syncNow(),
      device.api.syncNow(),
      device.api.syncNow(),
      device.api.disableSync(),
      device.api.syncNow(),
      device.api.enableSync(),
      device.api.syncNow(),
    ]);
    for (const result of results) ok(result);
    expect(device.control.maxInFlight).toBe(1);
    // First cycle (1 sync + follow-up), then sync after enable runs; the
    // three calls queued behind the first share one waiting cycle.
    expect(device.requests.every((r) => r === "POST /v1/sync")).toBe(true);
    expect((await device.api.getSyncStatus()).state).toBe("synced");
  });

  it("queues sign out behind a running cycle", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());
    device.requests.length = 0;
    device.control.delayMs = 5;
    device.control.maxInFlight = 0;
    const [cycle, out] = await Promise.all([
      device.api.syncNow(),
      device.api.signOutSync(),
    ]);
    ok(cycle);
    ok(out);
    expect(device.control.maxInFlight).toBe(1);
    expect(device.requests.at(-1)).toMatch(/^DELETE \/v1\/devices\//);
  });

  it("notifies subscribers with the applied row count", async () => {
    const { server, invite } = await newServer();
    const a = makeDevice(server);
    await a.accounts.create(account("From A"));
    await enrolAndStart(a, await invite());
    const b = makeDevice(server);
    const { code } = ok(await a.api.createSyncDeviceCode());
    ok(await b.api.enrolSync({ code, deviceName: "B", consent: true }));
    ok(await b.api.joinSync());

    await a.accounts.create(account("Second"));
    ok(await a.api.syncNow());
    const events: number[] = [];
    const stop = b.api.onSyncChange((event) => events.push(event.appliedRows));
    const result = ok(await b.api.syncNow());
    stop();
    await b.api.syncNow();
    expect(result.appliedRows).toBeGreaterThan(0);
    expect(events).toEqual([result.appliedRows]);
  });
});

describe("disable and enable", () => {
  it("disable keeps token and cursor; enable resumes without a code", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());
    const before = await device.state();

    const { status } = ok(await device.api.disableSync());
    expect(status).toMatchObject({ enabled: false, state: "disabled" });
    const after = await device.state();
    expect(after.token).toBe(before.token);
    expect(after.cursor).toBe(before.cursor);
    expect(after.device_id).toBe(before.device_id);

    device.requests.length = 0;
    await device.accounts.create(account("While off"));
    // A disabled device does not contact the server.
    ok(await device.api.syncNow());
    expect(device.requests).toEqual([]);

    const resumed = ok(await device.api.enableSync());
    expect(resumed.status).toMatchObject({ enabled: true, state: "synced" });
    expect(device.requests).toContain("POST /v1/sync");
  });

  it("enable needs a started device", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    ok(
      await device.api.enrolSync({ code: await invite(), deviceName: "A", consent: true }),
    );
    fail(await device.api.enableSync(), "not_started");
    fail(await device.api.syncNow(), "not_started");
  });
});

describe("sign out", () => {
  it("revokes the device on the server, then forgets the token and cursor, keeping data", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await device.accounts.create(account("Keep"));
    await enrolAndStart(device, await invite());
    const { token } = await device.state();

    const result = ok(await device.api.signOutSync());
    expect(result.serverRevoked).toBe(true);
    expect(result.status).toMatchObject({ enrolled: false, enabled: false });
    expect(await device.state()).toMatchObject({
      device_id: null,
      token: null,
      cursor: null,
      enabled: 0,
    });
    expect(await accountNames(device)).toEqual(["Keep"]);
    const old = await server.call("POST", "/v1/sync", {
      token: token!,
      body: { formatVersion: 1, cursor: "0", push: [] },
    });
    expect(old.status).toBe(401);
  });

  it("offline: fails with offline and changes nothing", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());
    const before = await device.state();
    device.control.offline = true;
    fail(await device.api.signOutSync(), "offline");
    expect(await device.state()).toEqual(before);
  });

  it("offline with force: signs out locally and says the server was not told", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());
    device.control.offline = true;
    const result = ok(await device.api.signOutSync({ force: true }));
    expect(result.serverRevoked).toBe(false);
    expect(await device.state()).toMatchObject({ token: null, cursor: null });
  });

  it("an already revoked device can still sign out locally", async () => {
    const { server, invite } = await newServer();
    const a = makeDevice(server);
    await enrolAndStart(a, await invite());
    const b = makeDevice(server);
    const { code } = ok(await a.api.createSyncDeviceCode());
    ok(await b.api.enrolSync({ code, deviceName: "B", consent: true }));
    ok(await b.api.joinSync());
    const bId = (await b.state()).device_id!;
    ok(await a.api.revokeSyncDevice(bId));
    expect(ok(await b.api.signOutSync()).serverRevoked).toBe(true);
    expect((await b.state()).token).toBeNull();
  });
});

describe("delete cloud data", () => {
  it("deletes on the server, stops sync here and keeps local data and the token", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await device.accounts.create(account("Local stays"));
    await enrolAndStart(device, await invite());
    const before = await device.state();

    const result = ok(await device.api.deleteSyncCloudData());
    expect(result.deletedRows).toBeGreaterThan(0);
    expect(result.status).toMatchObject({
      enabled: false,
      state: "cloud_data_deleted",
      enrolled: true,
    });
    const after = await device.state();
    expect(after.token).toBe(before.token);
    expect(after.cursor).toBe(before.cursor);
    expect(await accountNames(device)).toEqual(["Local stays"]);

    // The server is empty: Start works again with the same token.
    const restarted = ok(await device.api.startSync());
    expect(restarted.status).toMatchObject({ enabled: true, state: "synced" });
  });

  it("offline: fails with offline and changes nothing", async () => {
    const { server, invite } = await newServer();
    const device = makeDevice(server);
    await enrolAndStart(device, await invite());
    const before = await device.state();
    device.control.offline = true;
    fail(await device.api.deleteSyncCloudData(), "offline");
    expect(await device.state()).toEqual(before);
    expect((await device.api.getSyncStatus()).state).toBe("synced");
  });

  it("other devices see cloud_data_deleted on their next sync", async () => {
    const { server, invite } = await newServer();
    const a = makeDevice(server);
    await enrolAndStart(a, await invite());
    const b = makeDevice(server);
    const { code } = ok(await a.api.createSyncDeviceCode());
    ok(await b.api.enrolSync({ code, deviceName: "B", consent: true }));
    ok(await b.api.joinSync());
    ok(await a.api.deleteSyncCloudData());
    const { status } = ok(await b.api.syncNow());
    expect(status).toMatchObject({ state: "cloud_data_deleted", enabled: false });
  });
});

describe("start after delete", () => {
  it("Start works again from another device, and from a newly enrolled one", async () => {
    const { server, invite } = await newServer();
    const a = makeDevice(server);
    await a.accounts.create(account("A data"));
    await enrolAndStart(a, await invite());
    const b = makeDevice(server);
    await b.accounts.create(account("B data"));
    const { code } = ok(await a.api.createSyncDeviceCode());
    ok(await b.api.enrolSync({ code, deviceName: "B", consent: true }));
    ok(await b.api.joinSync());
    ok(await a.api.deleteSyncCloudData());
    expect(ok(await b.api.syncNow()).status.state).toBe("cloud_data_deleted");

    // B, which was not the device that deleted, starts the cloud copy again.
    const started = ok(await b.api.startSync());
    expect(started.status).toMatchObject({ enabled: true, state: "synced" });

    // A third device can then join it.
    const c = makeDevice(server);
    const { code: code2 } = ok(await b.api.createSyncDeviceCode());
    ok(await c.api.enrolSync({ code: code2, deviceName: "C", consent: true }));
    expect(ok(await c.api.joinSync()).status.state).toBe("synced");
    expect(await accountNames(c)).toContain("A data");
  });
});

describe("devices", () => {
  it("lists, creates codes and revokes another device", async () => {
    const { server, invite } = await newServer();
    const a = makeDevice(server);
    await enrolAndStart(a, await invite());
    const b = makeDevice(server);
    server.clock.now += 1000;
    const { code, expiresAt } = ok(await a.api.createSyncDeviceCode());
    expect(expiresAt).toBeTruthy();
    ok(await b.api.enrolSync({ code, deviceName: "B", consent: true }));

    const { devices } = ok(await a.api.listSyncDevices());
    expect(devices.map((d) => [d.name, d.current])).toEqual([
      ["Laptop", true],
      ["B", false],
    ]);
    const bId = devices.find((d) => d.name === "B")!.id;
    expect(ok(await a.api.revokeSyncDevice(bId))).toEqual({
      ok: true,
      signedOut: false,
    });
    fail(await a.api.revokeSyncDevice(bId), "not_found");
    expect(ok(await a.api.listSyncDevices()).devices).toHaveLength(1);
  });

  it("revoking this device's own id is a sign out", async () => {
    const { server, invite } = await newServer();
    const a = makeDevice(server);
    await enrolAndStart(a, await invite());
    const ownId = (await a.state()).device_id!;
    expect(ok(await a.api.revokeSyncDevice(ownId))).toEqual({
      ok: true,
      signedOut: true,
    });
    expect((await a.state()).token).toBeNull();
  });

  it("a revoked device is disconnected: its status says so and sync stops", async () => {
    const { server, invite } = await newServer();
    const a = makeDevice(server);
    await enrolAndStart(a, await invite());
    const b = makeDevice(server);
    const { code } = ok(await a.api.createSyncDeviceCode());
    ok(await b.api.enrolSync({ code, deviceName: "B", consent: true }));
    ok(await b.api.joinSync());
    const bId = (await b.state()).device_id!;
    ok(await a.api.revokeSyncDevice(bId));

    fail(await b.api.listSyncDevices(), "disconnected");
    expect(await b.api.getSyncStatus()).toMatchObject({
      state: "disconnected",
      enabled: false,
    });
    // A new code re-enrols it.
    const next = ok(await a.api.createSyncDeviceCode());
    ok(
      await b.api.enrolSync({ code: next.code, deviceName: "B2", consent: true }),
    );
    ok(await b.api.joinSync());
    expect((await b.api.getSyncStatus()).state).toBe("synced");
  });
});

describe("Electron: sync is unsupported", () => {
  it("every method reports unsupported and nothing is wired to IPC", async () => {
    const api = createUnsupportedSyncApi();
    for (const [name, method] of Object.entries(api)) {
      if (name === "getSyncStatus" || name === "onSyncChange") continue;
      const result = await (method as (...args: unknown[]) => Promise<unknown>)(
        { code: "x", deviceName: "x", consent: true },
      );
      expect(result).toMatchObject({ ok: false, reason: "unsupported" });
    }
    expect(await api.getSyncStatus()).toMatchObject({
      supported: false,
      state: "disabled",
    });
    expect(api.onSyncChange(() => undefined)).toBeTypeOf("function");
  });

  it("getSyncApi falls back to it when window.api has no sync methods", async () => {
    const electronLike = { getAccounts: () => Promise.resolve([]) };
    expect(await getSyncApi(electronLike).syncNow()).toMatchObject({
      reason: "unsupported",
    });
    const real = createUnsupportedSyncApi();
    expect(getSyncApi(real)).toBe(real);
  });

  it("the preload exposes no sync channel", async () => {
    const { readFileSync } = await import("node:fs");
    const preload = readFileSync("public/preload.js", "utf8");
    expect(preload).not.toMatch(/sync/i);
  });
});

