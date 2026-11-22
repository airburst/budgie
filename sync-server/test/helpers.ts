import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { addUser } from "../src/admin";
import { handleRequest, type AppDeps } from "../src/app";
import type { SqlExecutor } from "../src/executor";
import { applyMigration } from "../src/migrate";
import { createSqliteExecutor } from "../src/sqlite-executor";

const migration = readFileSync(
  new URL("../migrations/0001_init.sql", import.meta.url),
  "utf8",
);

export const T0 = Date.parse("2026-11-22T10:00:00.000Z");

export interface TestServer {
  db: Database.Database;
  executor: SqlExecutor;
  deps: AppDeps;
  clock: { now: number };
  call: (
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      rawBody?: string;
      token?: string;
      ip?: string;
    },
  ) => Promise<{ status: number; body: any; text: string; headers: Headers }>;
  /** Create a user (add-user), enrol a device with its invite; returns ids and token. */
  enrolDevice: (
    userName: string,
    deviceName?: string,
  ) => Promise<{ userId: string; deviceId: string; token: string }>;
}

export async function createTestServer(
  extra: Partial<AppDeps> = {},
): Promise<TestServer> {
  const db = new Database(":memory:");
  const executor = createSqliteExecutor(db);
  await applyMigration(executor, migration);
  const clock = { now: T0 };
  const deps: AppDeps = {
    executor,
    now: () => clock.now,
    devMode: false,
    ...extra,
  };

  const call: TestServer["call"] = async (method, path, opts = {}) => {
    const headers: Record<string, string> = {};
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.ip) headers["cf-connecting-ip"] = opts.ip;
    const init: RequestInit = { method, headers };
    if (opts.rawBody !== undefined) init.body = opts.rawBody;
    else if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    const res = await handleRequest(
      new Request(`https://sync.test${path}`, init),
      deps,
    );
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, body, text, headers: res.headers };
  };

  const enrolDevice: TestServer["enrolDevice"] = async (
    userName,
    deviceName = "Test device",
  ) => {
    const existing = db
      .prepare("SELECT id FROM users WHERE name = ?")
      .get(userName) as { id: string } | undefined;
    let code: string;
    let userId: string;
    if (existing) {
      const { newInvite } = await import("../src/admin");
      const inv = await newInvite(executor, userName, deps);
      code = inv.code;
      userId = inv.userId;
    } else {
      const inv = await addUser(executor, userName, deps);
      code = inv.code;
      userId = inv.userId;
    }
    const res = await call("POST", "/v1/enrol", {
      body: { code, deviceName },
    });
    if (res.status !== 201) throw new Error(`enrol failed: ${res.text}`);
    return { userId, deviceId: res.body.deviceId, token: res.body.token };
  };

  return { db, executor, deps, clock, call, enrolDevice };
}
