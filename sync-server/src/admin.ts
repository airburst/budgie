import { generateInviteCode, hashCode } from "./crypto";
import type { SqlExecutor } from "./executor";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_ATTEMPTS = 5;

export interface AdminDeps {
  now?: () => number;
  /** Returns a fresh invite code; injectable for tests. */
  generateCode?: () => string;
  newId?: () => string;
  /** Invite lifetime; defaults to 7 days (SPEC 3.4: server configuration). */
  inviteTtlMs?: number;
}

export interface IssuedInvite {
  userId: string;
  userName: string;
  /** Plain code. Shown once by the caller; never stored. */
  code: string;
  expiresAt: number;
}

function isCodeCollision(error: unknown): boolean {
  return (
    error instanceof Error &&
    /enrol_codes\.code_hash/.test(String(error.message))
  );
}

/** Create a user and its first invite in one batch. Rejects if the name is taken. */
export async function addUser(
  executor: SqlExecutor,
  name: string,
  deps: AdminDeps = {},
): Promise<IssuedInvite> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A user name is required");
  const now = (deps.now ?? Date.now)();
  const userId = (deps.newId ?? (() => crypto.randomUUID()))();
  const generate = deps.generateCode ?? generateInviteCode;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generate();
    const expiresAt = now + (deps.inviteTtlMs ?? INVITE_TTL_MS);
    try {
      await executor.batch([
        {
          sql: "INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)",
          params: [userId, trimmed, now],
        },
        {
          sql: "INSERT INTO enrol_codes (code_hash, user_id, kind, created_at, expires_at) VALUES (?, ?, 'invite', ?, ?)",
          params: [await hashCode(code), userId, now, expiresAt],
        },
      ]);
      return { userId, userName: trimmed, code, expiresAt };
    } catch (error) {
      if (isCodeCollision(error)) continue; // batch rolled back; try a new code
      if (/users\.name/.test(String((error as Error).message))) {
        throw new Error(`User "${trimmed}" already exists`, {
          cause: error,
        });
      }
      throw error;
    }
  }
  throw new Error("Could not generate an unused invite code");
}

/** Issue another invite for an existing user (looked up by name). */
export async function newInvite(
  executor: SqlExecutor,
  userName: string,
  deps: AdminDeps = {},
): Promise<IssuedInvite> {
  const name = userName.trim();
  const now = (deps.now ?? Date.now)();
  const generate = deps.generateCode ?? generateInviteCode;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generate();
    const expiresAt = now + (deps.inviteTtlMs ?? INVITE_TTL_MS);
    let results;
    try {
      results = await executor.batch([
        {
          sql: "INSERT INTO enrol_codes (code_hash, user_id, kind, created_at, expires_at) SELECT ?, id, 'invite', ?, ? FROM users WHERE name = ?",
          params: [await hashCode(code), now, expiresAt, name],
        },
        { sql: "SELECT id FROM users WHERE name = ?", params: [name] },
      ]);
    } catch (error) {
      if (isCodeCollision(error)) continue;
      throw error;
    }
    const userId = results[1]?.rows[0]?.id;
    // Not `changes`: `wrangler d1 execute --json` does not report it. The user row
    // exists iff the INSERT ... SELECT above matched it.
    if (typeof userId !== "string") {
      throw new Error(`No user named "${name}"`);
    }
    return { userId, userName: name, code, expiresAt };
  }
  throw new Error("Could not generate an unused invite code");
}
