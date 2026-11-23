import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { addUser, INVITE_TTL_MS, newInvite } from "../src/admin";
import { hashCode, normaliseCode } from "../src/crypto";
import type { SqlExecutor } from "../src/executor";
import { applyMigration } from "../src/migrate";
import { createSqliteExecutor } from "../src/sqlite-executor";
import { inlineParams } from "../scripts/wrangler-executor";

const migration = readFileSync(
  new URL("../migrations/0001_init.sql", import.meta.url),
  "utf8",
);

let db: Database.Database;
let executor: SqlExecutor;
const NOW = 1_800_000_000_000;

beforeEach(async () => {
  db = new Database(":memory:");
  executor = createSqliteExecutor(db);
  await applyMigration(executor, migration);
});

const invites = () =>
  db.prepare("SELECT * FROM enrol_codes").all() as Record<string, unknown>[];

describe("add-user", () => {
  it("creates the user and returns a code; only the hash is stored, with expiry", async () => {
    const r = await addUser(executor, "alice", { now: () => NOW });
    expect(r.code).toMatch(
      /^([0-9A-HJKMNP-TV-Z]{4}-){2}[0-9A-HJKMNP-TV-Z]{4}$/,
    );
    const rows = invites();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: r.userId,
      code_hash: await hashCode(r.code),
      expires_at: NOW + INVITE_TTL_MS,
      used_at: null,
    });
    // The plain code appears nowhere in the database.
    const dump = JSON.stringify([
      db.prepare("SELECT * FROM users").all(),
      db.prepare("SELECT * FROM enrol_codes").all(),
    ]);
    expect(dump).not.toContain(normaliseCode(r.code));
    expect(dump).not.toContain(r.code);
    expect(rows[0]?.code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a duplicate name and a blank name, creating nothing", async () => {
    await addUser(executor, "alice");
    await expect(addUser(executor, "alice")).rejects.toThrow(/already exists/);
    await expect(addUser(executor, "  ")).rejects.toThrow();
    expect(invites()).toHaveLength(1);
  });

  it("never returns a code that is already stored", async () => {
    const first = await addUser(executor, "alice", {
      generateCode: () => "AAAA-AAAA-AAAA",
    });
    const codes = ["AAAA-AAAA-AAAA", "BBBB-BBBB-BBBB"];
    const second = await addUser(executor, "bob", {
      generateCode: () => codes.shift()!,
    });
    expect(first.code).toBe("AAAA-AAAA-AAAA");
    expect(second.code).toBe("BBBB-BBBB-BBBB");
    expect(invites()).toHaveLength(2);
    expect(db.prepare("SELECT count(*) n FROM users").get()).toEqual({ n: 2 });
  });
});

describe("new-invite", () => {
  it("issues another code for an existing user", async () => {
    const a = await addUser(executor, "alice", { now: () => NOW });
    const b = await newInvite(executor, "alice", { now: () => NOW + 1000 });
    expect(b.userId).toBe(a.userId);
    expect(b.code).not.toBe(a.code);
    expect(invites()).toHaveLength(2);
    expect(db.prepare("SELECT count(*) n FROM users").get()).toEqual({ n: 1 });
  });

  it("fails for an unknown user and stores nothing", async () => {
    await expect(newInvite(executor, "ghost")).rejects.toThrow(/No user/);
    expect(invites()).toHaveLength(0);
  });

  it("never returns a code that is already stored", async () => {
    await addUser(executor, "alice", {
      generateCode: () => "AAAA-AAAA-AAAA",
    });
    const codes = ["AAAA-AAAA-AAAA", "CCCC-CCCC-CCCC"];
    const r = await newInvite(executor, "alice", {
      generateCode: () => codes.shift()!,
    });
    expect(r.code).toBe("CCCC-CCCC-CCCC");
    expect(invites()).toHaveLength(2);
  });
});

describe("code properties", () => {
  it("are single use and expiring: the stored row carries used_at and expires_at", async () => {
    const r = await addUser(executor, "alice", { now: () => NOW });
    const row = invites()[0]!;
    // The hash lookup the enrol endpoint (SY-012) will use.
    const hash = await hashCode(r.code.toLowerCase().replace(/-/g, " "));
    expect(hash).toBe(row.code_hash);
    expect(row.expires_at).toBe(NOW + INVITE_TTL_MS);
    expect(row.used_at).toBeNull();
    // Marking used is a conditional update that succeeds once.
    const sql =
      "UPDATE enrol_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?";
    const [one] = await executor.batch([{ sql, params: [NOW, hash, NOW] }]);
    const [two] = await executor.batch([{ sql, params: [NOW, hash, NOW] }]);
    expect(one?.changes).toBe(1);
    expect(two?.changes).toBe(0);
  });
});

describe("wrangler executor SQL inlining", () => {
  it("escapes quotes and handles null and numbers", () => {
    expect(
      inlineParams({ sql: "VALUES (?, ?, ?)", params: ["o'brien", 5, null] }),
    ).toBe("VALUES ('o''brien', 5, NULL)");
    expect(() => inlineParams({ sql: "?", params: [] })).toThrow();
    expect(() => inlineParams({ sql: "x", params: [1] })).toThrow();
  });
});

describe("code format (SPEC 3.4)", () => {
  it("normalises case, separators and look-alike letters", () => {
    expect(normaliseCode("h4tw-8pzr 3n6c")).toBe("H4TW8PZR3N6C");
    expect(normaliseCode("OIL0-1lio")).toBe("01101110");
  });
});
