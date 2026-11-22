// A fake sync server for Playwright, answered at the network layer with
// `page.route` on the configured sync origin (SY-037, SY-038). Responses follow
// `sync-server/contract/SPEC.md` (9.2 enrol, 9.3 sync). SY-044 replaces this
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
  failSync: { status: number; error: string } | null;
  /** Make every request fail as if offline. */
  offline: boolean;
  /** Number of pushed envelopes seen, over all syncs. */
  pushed: number;
};

const DEVICE_ID = "3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47";
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
  options: Partial<Pick<SyncMock, "hasData" | "codes">> = {},
): Promise<SyncMock> {
  let pull: MockEntry[] = [];
  let seeded: MockEntry[] = [];
  let seq = 0;
  const mock: SyncMock = {
    requests: [],
    codes: options.codes ?? new Set(["ABCD-EFGH"]),
    hasData: options.hasData ?? false,
    queuePull: (entries) => {
      pull = [...pull, ...entries];
    },
    seed: (entries) => {
      seeded = [...seeded, ...entries];
      mock.hasData = true;
    },
    delayMs: 0,
    failSync: null,
    offline: false,
    pushed: 0,
  };

  await page.route(`${SYNC_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    mock.requests.push(`${request.method()} ${path}`);
    if (mock.offline) return route.abort("internetdisconnected");

    if (path === "/v1/enrol") {
      const body = request.postDataJSON() as { code: string };
      const code = body.code.trim().toUpperCase();
      if (!mock.codes.has(code)) {
        return json(route, 400, { error: "bad_code" });
      }
      mock.codes.delete(code);
      return json(route, 201, {
        deviceId: DEVICE_ID,
        token: "mock-token-q9bV0n4yG2kO8wJm3tXr7cLs1eHp5uAz6dFi0gNy4Bk",
        hasData: mock.hasData,
      });
    }

    if (path === "/v1/sync") {
      if (mock.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, mock.delayMs));
      }
      if (mock.failSync) {
        return json(route, mock.failSync.status, {
          error: mock.failSync.error,
        });
      }
      const body = request.postDataJSON() as {
        push?: unknown[];
        cursor?: string;
      };
      mock.pushed += body.push?.length ?? 0;
      if (body.push?.length) mock.hasData = true;
      // Like the server: cursor "0" returns the whole data set.
      const entries = body.cursor === "0" ? [...seeded, ...pull] : pull;
      pull = [];
      seq += 1;
      return json(route, 200, {
        formatVersion: 1,
        cursor: `1:${seq}`,
        more: false,
        pull: entries,
        rejected: [],
      });
    }

    return json(route, 404, { error: "not_found" });
  });

  return mock;
}
