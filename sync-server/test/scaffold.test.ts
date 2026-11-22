import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createD1Executor, type D1DatabaseLike } from "../src/d1-executor";
import { applyMigration, splitStatements } from "../src/migrate";
import { createSqliteExecutor } from "../src/sqlite-executor";
import { handleRequest } from "../src/app";
import { ensureDevSchema } from "../src/dev-bootstrap";
import { CONTRACT_VERSION, FORMAT_VERSION } from "../src/version";

const migration = readFileSync(
  new URL("../migrations/0001_init.sql", import.meta.url),
  "utf8",
);

function freshDb() {
  const db = new Database(":memory:");
  return { db, executor: createSqliteExecutor(db) };
}

describe("migration", () => {
  it("creates the tables and indexes on better-sqlite3", async () => {
    const { db, executor } = freshDb();
    await applyMigration(executor, migration);
    const names = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type IN ('table','index')",
        )
        .all() as { name: string }[]
    ).map((r) => r.name);
    for (const n of [
      "users",
      "devices",
      "changes",
      "enrol_codes",
      "changes_cursor_idx",
    ]) {
      expect(names).toContain(n);
    }
    const idx = db.prepare("PRAGMA index_info(changes_cursor_idx)").all() as {
      name: string;
    }[];
    expect(idx.map((c) => c.name)).toEqual([
      "user_id",
      "seq",
      "tbl",
      "public_id",
    ]);
    const sql = (
      db
        .prepare("SELECT sql FROM sqlite_master WHERE name='changes'")
        .get() as {
        sql: string;
      }
    ).sql;
    expect(sql).toMatch(/WITHOUT ROWID/);
  });

  it("runs the same statements through the D1 executor", async () => {
    const { db } = freshDb();
    // Fake D1 binding backed by better-sqlite3, to prove the D1 path issues the same SQL.
    const seen: string[] = [];
    const fake: D1DatabaseLike = {
      prepare(sql) {
        const bound: unknown[] = [];
        const p = {
          sql,
          bound,
          bind(...v: unknown[]) {
            bound.push(...v);
            return p;
          },
        };
        return p;
      },
      batch(stmts) {
        const run = db.transaction(() =>
          (stmts as unknown as { sql: string; bound: never[] }[]).map((s) => {
            seen.push(s.sql);
            const st = db.prepare(s.sql);
            return st.reader
              ? { results: st.all(...s.bound) as Record<string, unknown>[] }
              : { meta: { changes: st.run(...s.bound).changes } };
          }),
        );
        return Promise.resolve(run());
      },
    };
    await applyMigration(createD1Executor(fake), migration);
    expect(seen).toEqual(splitStatements(migration));
    expect(seen.length).toBe(splitStatements(migration).length);
  });

  it("rolls the whole batch back when a statement fails", async () => {
    const { executor } = freshDb();
    await applyMigration(executor, migration);
    await expect(
      executor.batch([
        {
          sql: "INSERT INTO users (id, name, seq, created_at) VALUES ('a','a',0,1)",
        },
        { sql: "INSERT INTO nope VALUES (1)" },
      ]),
    ).rejects.toThrow();
    const [r] = await executor.batch([
      { sql: "SELECT count(*) AS n FROM users" },
    ]);
    expect(r?.rows[0]?.n).toBe(0);
  });
});

describe("GET /v1/health", () => {
  it("returns the format and contract versions", async () => {
    const { executor } = freshDb();
    const res = await handleRequest(new Request("https://x.test/v1/health"), {
      executor,
      now: Date.now,
      devMode: false,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      formatVersion: FORMAT_VERSION,
      contractVersion: CONTRACT_VERSION,
    });
  });

  it("answers an unknown path or method with the standard error body", async () => {
    const { executor } = freshDb();
    const res = await handleRequest(
      new Request("https://x.test/v1/health", { method: "POST" }),
      { executor, now: Date.now, devMode: false },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not_found" });
  });

  it("does not expose /dev/admin routes outside dev mode", async () => {
    const { executor } = freshDb();
    const res = await handleRequest(
      new Request("https://x.test/dev/admin/add-user", {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      }),
      { executor, now: Date.now, devMode: false },
    );
    expect(res.status).toBe(404);
  });
});

describe("dev bootstrap", () => {
  it("applies the schema once and leaves existing data alone", async () => {
    const { db, executor } = freshDb();
    await ensureDevSchema(executor);
    await executor.batch([
      { sql: "INSERT INTO users (id, name, created_at) VALUES ('u','n',1)" },
    ]);
    await ensureDevSchema(executor);
    expect(db.prepare("SELECT count(*) n FROM users").get()).toEqual({ n: 1 });
  });

  it("seeds a user and invite through the dev admin routes", async () => {
    const { executor } = freshDb();
    await ensureDevSchema(executor);
    const deps = { executor, now: Date.now, devMode: true };
    const add = await handleRequest(
      new Request("https://x.test/dev/admin/add-user", {
        method: "POST",
        body: JSON.stringify({ name: "alice" }),
      }),
      deps,
    );
    expect(add.status).toBe(201);
    const invite = await handleRequest(
      new Request("https://x.test/dev/admin/new-invite", {
        method: "POST",
        body: JSON.stringify({ user: "alice" }),
      }),
      deps,
    );
    expect(invite.status).toBe(201);
    expect(await invite.json()).toMatchObject({ userName: "alice" });
    const missing = await handleRequest(
      new Request("https://x.test/dev/admin/new-invite", {
        method: "POST",
        body: JSON.stringify({ user: "ghost" }),
      }),
      deps,
    );
    expect(missing.status).toBe(404);
  });
});
