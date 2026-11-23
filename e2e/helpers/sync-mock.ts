// A fake sync server for Playwright, answered at the network layer with
// `page.route` on the configured sync origin (SY-037, SY-038). Responses follow
// `sync-server/contract/SPEC.md` (9.2 enrol, 9.3 sync, 9.4-9.7 devices and
// data). It is stateful enough for two browser contexts to share one server
// (`mockSyncServer(page, { share: first })`): codes are accepted once, each
// enrolment makes a device with its own token, the device list shows them all,
// and "delete my cloud data" invalidates earlier cursors. SY-044 replaces this
// helper with the real local server stack; keep every mock in this file.
//
// Nothing reaches the network: `requests` records what the app sent, so a test
// can assert that nothing was sent before the user turned sync on.

import type { Page, Route } from "@playwright/test";

/** `VITE_SYNC_SERVER_URL` of the "sync-origin" build (playwright.config.ts). */
export const SYNC_ORIGIN = "http://127.0.0.1:4599";
const APP_ORIGIN = "http://127.0.0.1:4174";

export type MockEntry = {
  tbl: string;
  publicId: string;
  hlc: string;
  deleted: boolean;
  payload: Record<string, unknown>;
};

export type SyncMock = {
  /** `METHOD /path` of every request that reached the sync origin. */
  requests: string[];
  /** Codes enrol accepts (single use). Defaults to ["ABCD-EFGH"]. */
  codes: Set<string>;
  /** Whether the server already holds data (enrol `hasData`). */
  hasData: boolean;
  /** Rows the next incremental sync answers with (then cleared). */
  queuePull: (entries: MockEntry[]) => void;
  /** Rows the server already holds: every sync from cursor "0" returns them. */
  seed: (entries: MockEntry[]) => void;
  /** Delay every sync answer, to see progress. */
  delayMs: number;
  /** Answer sync with this error instead (`status`, `error`), or null. */
  failSync: {
    status: number;
    error: string;
    /** Seconds, for 429 and 503 (sent in the body). */
    retryAfter?: number;
    /** Extra body fields, e.g. `formatVersion` of `format_too_old`. */
    extra?: Record<string, unknown>;
  } | null;
  /** Reject every pushed envelope with this reason (e.g. "drift"), or null. */
  rejectPush: "drift" | "stale" | null;
  /** Make every request fail as if offline. */
  offline: boolean;
  /** Number of pushed envelopes seen, over all syncs. */
  pushed: number;
  /** Devices enrolled on this server, oldest first. */
  devices: MockDevice[];
  /** Codes issued by `POST /v1/devices/code`, in order. */
  issuedCodes: string[];
  /** Server-side state, shared by every page that uses this mock. */
  state: ServerState;
};

export type MockDevice = {
  id: string;
  name: string;
  token: string;
  createdAt: string;
  lastSeenAt: string | null;
  revoked: boolean;
};

type ServerState = {
  pull: MockEntry[];
  seeded: MockEntry[];
  seq: number;
  /** Bumped by `DELETE /v1/data`: older cursors then get `409 data_reset`. */
  epoch: number;
  /** Pushed rows by `tbl/publicId`: what a later device's Join receives. */
  stored: Map<string, MockEntry>;
};

const OTHER_DEVICE_ID = "9d2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50";

const hlc = () =>
  `${String(Date.now()).padStart(15, "0")}:00000:${OTHER_DEVICE_ID}`;

/** A payee row as another device would have written it. */
export const payeeEntry = (name: string, publicId: string): MockEntry => {
  const at = new Date().toISOString().slice(0, 19).replace("T", " ");
  return {
    tbl: "payees",
    publicId,
    hlc: hlc(),
    deleted: false,
    payload: {
      publicId,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      name,
      categoryPublicId: null,
      amount: null,
    },
  };
};

const cors = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization,content-type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE",
  "Cache-Control": "no-store",
};

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export async function mockSyncServer(
  page: Page,
  options: Partial<Pick<SyncMock, "hasData" | "codes">> & {
    /** Use another mock's server (a second browser context). */
    share?: SyncMock;
  } = {},
): Promise<SyncMock> {
  const mock: SyncMock = options.share ?? {
    requests: [],
    codes: options.codes ?? new Set(["ABCD-EFGH"]),
    hasData: options.hasData ?? false,
    queuePull: (entries) => {
      mock.state.pull = [...mock.state.pull, ...entries];
    },
    seed: (entries) => {
      mock.state.seeded = [...mock.state.seeded, ...entries];
      mock.hasData = true;
    },
    delayMs: 0,
    failSync: null,
    rejectPush: null,
    offline: false,
    pushed: 0,
    devices: [],
    issuedCodes: [],
    state: { pull: [], seeded: [], seq: 0, epoch: 1, stored: new Map() },
  };
  const state = mock.state;

  await page.route(`${SYNC_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    mock.requests.push(`${request.method()} ${path}`);
    if (mock.offline) return route.abort("internetdisconnected");

    // Every route but enrol needs a live device token.
    let device: MockDevice | undefined;
    if (path !== "/v1/enrol") {
      const bearer = (request.headers()["authorization"] ?? "").replace(
        /^Bearer /,
        "",
      );
      device = mock.devices.find((d) => d.token === bearer);
      if (!device) return json(route, 401, { error: "bad_token" });
      if (device.revoked) return json(route, 401, { error: "revoked" });
      device.lastSeenAt = new Date().toISOString();
    }

    if (path === "/v1/enrol") {
      const body = request.postDataJSON() as { code: string };
      const code = body.code.trim().toUpperCase();
      if (!mock.codes.has(code)) {
        return json(route, 400, { error: "bad_code" });
      }
      mock.codes.delete(code);
      const enrolled: MockDevice = {
        id: crypto.randomUUID(),
        name:
          (request.postDataJSON() as { deviceName?: string }).deviceName ?? "",
        token: `mock-token-${crypto.randomUUID()}-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        lastSeenAt: null,
        revoked: false,
      };
      mock.devices.push(enrolled);
      return json(route, 201, {
        deviceId: enrolled.id,
        token: enrolled.token,
        hasData: mock.hasData,
      });
    }

    if (path === "/v1/devices/code" && request.method() === "POST") {
      const code = `T${String(mock.issuedCodes.length + 1).padStart(3, "0")}-CODE`;
      mock.issuedCodes.push(code);
      mock.codes.add(code);
      return json(route, 201, {
        code,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
    }

    if (path === "/v1/devices" && request.method() === "GET") {
      return json(route, 200, {
        devices: mock.devices
          .filter((d) => !d.revoked)
          .map((d) => ({
            id: d.id,
            name: d.name,
            createdAt: d.createdAt,
            lastSeenAt: d.lastSeenAt,
            current: d.id === device!.id,
          })),
      });
    }

    if (path.startsWith("/v1/devices/") && request.method() === "DELETE") {
      const target = mock.devices.find(
        (d) => d.id === path.slice("/v1/devices/".length) && !d.revoked,
      );
      if (!target) return json(route, 404, { error: "not_found" });
      target.revoked = true;
      return route.fulfill({ status: 204, headers: cors });
    }

    if (path === "/v1/data" && request.method() === "DELETE") {
      const deletedRows = state.stored.size + state.seeded.length;
      state.seeded = [];
      state.stored = new Map();
      state.pull = [];
      state.epoch += 1;
      mock.hasData = false;
      return json(route, 200, {
        deletedRows,
        deletedSnapshots: 0,
        timeTravelRetentionDays: 7,
      });
    }

    if (path === "/v1/sync") {
      if (mock.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, mock.delayMs));
      }
      if (mock.failSync) {
        const { status, error, retryAfter, extra } = mock.failSync;
        return json(route, status, {
          error,
          ...(retryAfter === undefined ? {} : { retryAfter }),
          ...extra,
        });
      }
      const body = request.postDataJSON() as {
        push?: { tbl: string; publicId: string }[];
        cursor?: string;
      };
      // Like the server: a cursor from before a delete is refused, "0" is not.
      if (body.cursor !== "0" && !body.cursor?.startsWith(`${state.epoch}:`)) {
        return json(route, 409, { error: "data_reset" });
      }
      // Like the server: cursor "0" returns the whole data set (as it was
      // before this request's own push).
      const entries =
        body.cursor === "0"
          ? [...state.seeded, ...state.stored.values(), ...state.pull]
          : state.pull;
      const all = (body.push ?? []) as MockEntry[];
      const rejected = mock.rejectPush
        ? all.map(({ tbl, publicId }) => ({
            tbl,
            publicId,
            reason: mock.rejectPush,
          }))
        : [];
      const pushed = mock.rejectPush ? [] : all;
      mock.pushed += pushed.length;
      for (const entry of pushed) {
        state.stored.set(`${entry.tbl}/${entry.publicId}`, entry);
      }
      if (all.length) mock.hasData = true;
      state.pull = [];
      state.seq += 1;
      return json(route, 200, {
        formatVersion: 1,
        cursor: `${state.epoch}:${state.seq}`,
        more: false,
        pull: entries,
        rejected,
      });
    }

    return json(route, 404, { error: "not_found" });
  });

  return mock;
}
