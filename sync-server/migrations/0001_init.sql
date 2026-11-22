-- Statements end with a semicolon at the end of a line, so the same file runs
-- through D1 (wrangler) and through better-sqlite3 (see src/migrate.ts).
-- Tables follow sync-server/contract/SPEC.md section 12.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  seq INTEGER NOT NULL DEFAULT 0,
  max_format_version INTEGER NOT NULL DEFAULT 1,
  data_epoch INTEGER NOT NULL DEFAULT 1,
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

-- Invite codes and device codes: only the SHA-256 (hex) of the normalised code
-- is stored. kind is 'invite' or 'device'. used_by_device is the device created
-- when the code was consumed (it lets the consume and the device insert happen
-- in one batch without a read in between).
CREATE TABLE enrol_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by_device TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX enrol_codes_user_idx ON enrol_codes (user_id);

-- Fixed-window counters for the in-Worker rate limits (failed enrolments per IP).
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

-- Index of the daily R2 snapshots (R2 itself is not listed by the admin
-- scripts, which can only get and delete objects through wrangler).
CREATE TABLE snapshots (
  user_id TEXT NOT NULL REFERENCES users (id),
  snapshot_date TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, snapshot_date)
) WITHOUT ROWID;
