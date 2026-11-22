// Multi-client sync test harness: N migrated in-memory Budgie databases
// (behind DatabaseCapability, so the real services and triggers run) syncing
// through the real sync engine against one in-process sync server on
// in-memory better-sqlite3. No network.
//
// Each client has its own enrolled device (id and token in `sync_state`), a
// controllable clock (`client.clock.now`, the engine's `now`), and a request
// interceptor to fail a request before it reaches the server, fail it after
// the server has processed it, or run code (an "in flight" edit) between the
// server's answer and the client seeing it.
//
// Seeded categories (`legacy:categories:N`) are given the same canonical UUID
// and timestamps on every client, as if all clients already shared one data
// set, so rows that reference them sync. They stay clean.

import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import { createAccountService } from "@/services/accounts";
import { createBudgetService } from "@/services/budgets";
import { createCategoryService } from "@/services/categories";
import { createEnvelopeService } from "@/services/envelopes";
import { createPayeeService } from "@/services/payees";
import {
  loadPublicIdLookup,
  PORTABLE_TABLES,
  type PortableTable,
} from "@/services/portable-data";
import { createTransactionService } from "@/services/transactions";
import { encodeSyncRow } from "@/services/sync/codec";
import {
  runSyncCycle,
  runSyncRound,
  type SyncEngineDeps,
  type SyncTransport,
} from "@/services/sync/engine";
import { SyncHttpError } from "@/services/sync/errors";
import type { SyncRequest, SyncResponse } from "@/services/sync/payload";
import { readTombstones } from "@/services/tombstone-store";
import { createCapabilityDatabase } from "@/tests/helpers/portable-fixture";
import { vi } from "vitest";
import {
  createTestServer,
  type TestServer,
} from "../../../sync-server/test/helpers";

/** Where an injected failure happens. */
export type FailureStage = "before-server" | "after-server";

/** Thrown by the harness transport for an injected failure ("offline"). */
export class HarnessNetworkError extends Error {
  constructor(readonly stage: FailureStage) {
    super(`Injected network failure (${stage})`);
    this.name = "HarnessNetworkError";
  }
}

type Interceptor =
  | { at: number; kind: "fail"; stage: FailureStage }
  | { at: number; kind: "before-response"; run: () => Promise<void> | void };

/** One row as the sync engine sees it: payload plus sync state. */
export type SyncedRow = {
  tbl: PortableTable;
  publicId: string;
  hlc: string | null;
  dirty: boolean;
  unsealed: boolean;
  payload: Record<string, unknown>;
};

export type SyncHarnessClient = {
  name: string;
  database: DatabaseCapability;
  deviceId: string;
  token: string;
  /** The engine's clock. Defaults to the real time at harness creation. */
  clock: { now: number };
  services: {
    accounts: ReturnType<typeof createAccountService>;
    transactions: ReturnType<typeof createTransactionService>;
    categories: ReturnType<typeof createCategoryService>;
    payees: ReturnType<typeof createPayeeService>;
    envelopes: ReturnType<typeof createEnvelopeService>;
    budgets: ReturnType<typeof createBudgetService>;
  };
  /** Every request this client sent (including failed ones), in order. */
  requests: SyncRequest[];
  /** Deps for the engine (transport, clock), with optional overrides. */
  deps: (overrides?: Partial<SyncEngineDeps>) => SyncEngineDeps;
  /** A full cycle (`runSyncCycle`). */
  sync: (
    overrides?: Partial<SyncEngineDeps>,
  ) => ReturnType<typeof runSyncCycle>;
  /** A single round (`runSyncRound`). */
  round: (
    overrides?: Partial<SyncEngineDeps>,
  ) => ReturnType<typeof runSyncRound>;
  /**
   * Fails a future request: by default the next one; `skip` lets that many
   * requests through first. `before-server` never reaches the server;
   * `after-server` is processed (and stored) by the server, then lost.
   */
  failRequest: (stage: FailureStage, options?: { skip?: number }) => void;
  /** Runs `run` after the server answered a future request, before the client sees it. */
  beforeResponse: (
    run: () => Promise<void> | void,
    options?: { skip?: number },
  ) => void;
  /** Stored cursor in `sync_state`. */
  cursor: () => Promise<string | null>;
  /** Every row of `table` (deleted ones included, tombstone store too). */
  rows: (table: PortableTable) => Promise<SyncedRow[]>;
  /** One row by public id, or null. */
  row: (table: PortableTable, publicId: string) => Promise<SyncedRow | null>;
  /** Every row of every synced table, ordered by table then public id. */
  snapshot: () => Promise<SyncedRow[]>;
  /** Public id of a local row by its integer id. */
  publicIdOf: (table: PortableTable, id: number) => Promise<string>;
};

export type SyncHarness = {
  server: TestServer;
  clients: SyncHarnessClient[];
  close: () => void;
};

/** Real wall-clock time, even under `vi.setSystemTime`. */
const realNow = () => vi.getRealSystemTime();

export const sharedSeedId = (localId: number) =>
  `00000000-0000-4000-8000-${String(localId).padStart(12, "0")}`;

const toSyncedRows = async (
  database: DatabaseCapability,
  table: PortableTable,
  rows: DatabaseRow[],
): Promise<SyncedRow[]> => {
  const publicIdOf = await database.transaction((transaction) =>
    loadPublicIdLookup(transaction, table, rows),
  );
  return rows.map((row) => {
    const payload = encodeSyncRow(table, row, publicIdOf) as Record<
      string,
      unknown
    >;
    return {
      tbl: table,
      publicId: payload.publicId as string,
      hlc: (row.hlc as string | null) ?? null,
      dirty: row.sync_dirty === 1,
      unsealed: row.sync_unsealed === 1,
      payload,
    };
  });
};

const createClient = async (
  server: TestServer,
  name: string,
  closers: Array<() => void>,
  fresh = false,
): Promise<SyncHarnessClient> => {
  const { database, close } = createCapabilityDatabase();
  closers.push(close);
  const device = await server.enrolDevice("harness-user", name);

  // Shared seed ids: an engine write (sync_rev bump), so rows stay clean.
  // A fresh client keeps its `legacy:` ids and is enrolled but not started.
  for (const table of fresh ? [] : PORTABLE_TABLES) {
    await database.execute({
      sql: `UPDATE ${table}
        SET public_id = '00000000-0000-4000-8000-' || substr('000000000000' || id, -12),
            created_at = '2026-01-01 00:00:00',
            updated_at = '2026-01-01 00:00:00',
            sync_rev = sync_rev + 1
        WHERE public_id LIKE 'legacy:%'`,
    });
  }
  await database.execute({
    sql: fresh
      ? "UPDATE sync_state SET device_id = ?, token = ?, server_url = ? WHERE id = 1"
      : "UPDATE sync_state SET device_id = ?, token = ?, server_url = ?, cursor = '0', enabled = 1 WHERE id = 1",
    params: [device.deviceId, device.token, "https://sync.test"],
  });

  const clock = { now: realNow() };
  const requests: SyncRequest[] = [];
  const interceptors: Interceptor[] = [];
  const due = (n: number) => interceptors.filter((i) => i.at === n);

  const transport: SyncTransport = async (request, auth) => {
    requests.push(request);
    const n = requests.length;
    const actions = due(n);
    if (actions.some((a) => a.kind === "fail" && a.stage === "before-server")) {
      throw new HarnessNetworkError("before-server");
    }
    const response = await server.call("POST", "/v1/sync", {
      token: auth.token,
      body: request,
    });
    if (actions.some((a) => a.kind === "fail" && a.stage === "after-server")) {
      throw new HarnessNetworkError("after-server");
    }
    for (const action of actions) {
      if (action.kind === "before-response") await action.run();
    }
    if (response.status !== 200) {
      const body = (response.body ?? {}) as {
        error?: string;
        retryAfter?: number;
      };
      throw new SyncHttpError(
        response.status,
        body.error ?? "unknown",
        body.retryAfter ?? null,
        body,
      );
    }
    return response.body as SyncResponse;
  };

  const deps = (overrides: Partial<SyncEngineDeps> = {}): SyncEngineDeps => ({
    transport,
    now: () => clock.now,
    ...overrides,
  });

  // Rows in the tombstone store (SPEC.md 8.10) are rows of their table.
  const storedRows = async (table: PortableTable): Promise<SyncedRow[]> =>
    (await readTombstones(database, table)).map((stored) => ({
      tbl: table,
      publicId: stored.publicId,
      hlc: stored.hlc,
      dirty: stored.dirty,
      unsealed: stored.unsealed,
      payload: stored.payload,
    }));

  const rows = async (table: PortableTable) =>
    [
      ...(await toSyncedRows(
        database,
        table,
        await database.query({
          sql: `SELECT * FROM ${table} ORDER BY public_id`,
        }),
      )),
      ...(await storedRows(table)),
    ].sort((a, b) => (a.publicId < b.publicId ? -1 : 1));

  return {
    name,
    database,
    deviceId: device.deviceId,
    token: device.token,
    clock,
    services: {
      accounts: createAccountService(database),
      transactions: createTransactionService(database),
      categories: createCategoryService(database),
      payees: createPayeeService(database),
      envelopes: createEnvelopeService(database),
      budgets: createBudgetService(database),
    },
    requests,
    deps,
    sync: (overrides) => runSyncCycle(database, deps(overrides)),
    round: (overrides) => runSyncRound(database, deps(overrides)),
    failRequest: (stage, options = {}) => {
      interceptors.push({
        at: requests.length + 1 + (options.skip ?? 0),
        kind: "fail",
        stage,
      });
    },
    beforeResponse: (run, options = {}) => {
      interceptors.push({
        at: requests.length + 1 + (options.skip ?? 0),
        kind: "before-response",
        run,
      });
    },
    cursor: async () => {
      const [state] = await database.query<{ cursor: string | null }>({
        sql: "SELECT cursor FROM sync_state WHERE id = 1",
      });
      return state?.cursor ?? null;
    },
    rows,
    row: async (table, publicId) =>
      (
        await toSyncedRows(
          database,
          table,
          await database.query({
            sql: `SELECT * FROM ${table} WHERE public_id = ?`,
            params: [publicId],
          }),
        )
      )[0] ??
      (await storedRows(table)).find((row) => row.publicId === publicId) ??
      null,
    snapshot: async () => {
      const all: SyncedRow[] = [];
      for (const table of PORTABLE_TABLES) all.push(...(await rows(table)));
      return all;
    },
    publicIdOf: async (table, id) => {
      const [found] = await database.query<{ public_id: string }>({
        sql: `SELECT public_id FROM ${table} WHERE id = ?`,
        params: [id],
      });
      if (!found) throw new Error(`No ${table} row ${id}`);
      return found.public_id;
    },
  };
};

/**
 * Creates the server and `clients` clients (names default to A, B, C...),
 * all enrolled for one user. `pageSize` sets the server's pull page size.
 * `fresh` clients are enrolled only: `legacy:` ids kept and sync not started
 * (cursor NULL, disabled), as before Start (SY-031).
 */
export const createSyncHarness = async (
  options: {
    clients?: number | string[];
    pageSize?: number;
    fresh?: boolean;
  } = {},
): Promise<SyncHarness> => {
  const server = await createTestServer(
    options.pageSize === undefined ? {} : { pageSize: options.pageSize },
  );
  server.clock.now = realNow();
  const names = Array.isArray(options.clients)
    ? options.clients
    : Array.from({ length: options.clients ?? 2 }, (_, i) =>
        String.fromCharCode(65 + i),
      );
  const closers: Array<() => void> = [() => server.db.close()];
  const clients: SyncHarnessClient[] = [];
  for (const name of names) {
    clients.push(await createClient(server, name, closers, options.fresh));
  }
  return {
    server,
    clients,
    close: () => {
      for (const close of closers.splice(0)) close();
    },
  };
};

/**
 * The rows of a snapshot without per-device sync state, for comparing two
 * clients' data: public id, HLC and payload.
 */
export const comparable = (rows: SyncedRow[]) =>
  rows.map(({ tbl, publicId, hlc, payload }) => ({
    tbl,
    publicId,
    hlc,
    payload,
  }));
