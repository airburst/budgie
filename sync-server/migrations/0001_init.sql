-- Statements end with a semicolon at the end of a line, so the same file runs
-- through D1 (wrangler) and through better-sqlite3 (see src/migrate.ts).
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX devices_user_idx ON devices (user_id);

CREATE TABLE changes (
  user_id TEXT NOT NULL,
  tbl TEXT NOT NULL,
  public_id TEXT NOT NULL,
  hlc TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  device_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, tbl, public_id)
) WITHOUT ROWID;

CREATE INDEX changes_cursor_idx ON changes (user_id, seq, tbl, public_id);

-- Invite codes and (SY-015) device codes: only the SHA-256 of a code is stored.
CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL DEFAULT 'invite',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX invites_user_idx ON invites (user_id);
