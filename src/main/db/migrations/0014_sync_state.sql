-- 0014: sync bookkeeping columns, triggers and the single-row `sync_state` table.
-- Written by hand (story SY-022). No table is dropped; only triggers are replaced.
--
-- COLUMNS (on each of the 10 synced tables)
--   hlc           TEXT     Hybrid logical clock of the row's current version (SPEC.md 7).
--                          NULL = never sealed and never synced.
--   sync_dirty    INTEGER  1 = holds a local version the server has not acknowledged.
--   sync_unsealed INTEGER  1 = edited locally since `hlc` was last stamped
--                          ("unsealed", SPEC.md 8.3). Kept apart from sync_dirty so an
--                          edit made while a push is in flight is not acknowledged away.
--   sync_rev      INTEGER  Per-row write counter. EVERY write to the row increments it:
--                          user writes via the triggers below, engine writes explicitly.
--                          It is the engine-write marker (see TRIGGERS).
--
-- TRIGGERS
--   A user write never mentions the sync columns; an engine write always sets
--   `sync_rev = sync_rev + 1`. So an UPDATE that leaves sync_rev unchanged is a user
--   write, and `<table>_sync_metadata_update` (AFTER UPDATE, WHEN NEW.sync_rev IS
--   OLD.sync_rev) then marks the row dirty and unsealed, bumps sync_rev, and sets
--   updated_at = CURRENT_TIMESTAMP unless the statement itself changed updated_at
--   (the 0013 behaviour). Any UPDATE made by an engine statement, or by a trigger
--   body here, changes sync_rev and is therefore left alone. This needs no session
--   state, temp table or extension, and holds whether recursive_triggers is on or
--   off: SQLite (with it off) only stops a trigger re-firing itself; other triggers
--   do fire on a trigger's UPDATE, and they see sync_rev changed.
--   `<table>_sync_metadata_insert` (AFTER INSERT, WHEN NEW.hlc IS NULL) treats an
--   insert without an hlc as a user insert: fills public_id with a canonical
--   lowercase UUID v4 and updated_at with CURRENT_TIMESTAMP when missing, and marks
--   the row dirty and unsealed. An insert WITH an hlc is an engine insert and is
--   left exactly as written (the engine supplies public_id and updated_at).
--
-- ENGINE RULES (the sync engine MUST follow these)
--   * Every engine UPDATE sets `sync_rev = sync_rev + 1`. Forgetting it makes the
--     write look like a user edit (row dirtied, updated_at bumped).
--   * Every engine INSERT supplies a non-null hlc, public_id and updated_at.
--   * Seal (stamp a dirty, unsealed row):
--       UPDATE t SET hlc = :newHlc, sync_unsealed = 0, sync_rev = sync_rev + 1
--        WHERE id = :id AND sync_unsealed = 1;
--   * Acknowledge (stored, or rejected `stale`):
--       UPDATE t SET sync_dirty = 0, sync_rev = sync_rev + 1
--        WHERE public_id = :publicId AND hlc = :pushedHlc
--          AND sync_dirty = 1 AND sync_unsealed = 0;
--     A boolean is enough: sync_unsealed only returns to 0 by a seal or a remote
--     apply, and both strictly raise hlc (seal rule SPEC.md 7.3; apply only when
--     the incoming hlc is greater), so `hlc = :pushedHlc AND sync_unsealed = 0`
--     holds only if the row is still exactly the version that was pushed.
--   * Remote apply over an existing row (after sealing it if unsealed, SPEC.md 8.2):
--       UPDATE t SET <payload columns>, updated_at = :payloadUpdatedAt,
--              hlc = :envelopeHlc, sync_dirty = 0, sync_unsealed = 0,
--              sync_rev = sync_rev + 1
--        WHERE public_id = :publicId AND (hlc IS NULL OR hlc < :envelopeHlc);
--     Remote apply of a new row:
--       INSERT INTO t (<payload columns>, public_id, updated_at, hlc)
--       VALUES (..., :publicId, :payloadUpdatedAt, :envelopeHlc);
--     (sync_dirty and sync_unsealed default to 0.)
--   * Start (SPEC.md 11.1), after rewriting non-UUID public ids:
--       UPDATE t SET sync_dirty = 1, sync_unsealed = 1, sync_rev = sync_rev + 1;
--     Join (SPEC.md 11.2):
--       UPDATE t SET <delete fields>, hlc = NULL, sync_dirty = 0,
--              sync_unsealed = 0, sync_rev = sync_rev + 1;
--     (Join is why the marker is a counter: for a never-synced clean row it
--     changes no other sync column.)
--
-- EXISTING ROWS start clean and with no hlc (sync_dirty = 0, sync_unsealed = 0,
-- sync_rev = 0). Deliberate: sync is off by default and Start (SPEC.md 11.1)
-- rewrites non-UUID public ids and marks every row dirty and unsealed. Rows
-- written after this migration are dirty whether or not sync is enabled; Start
-- marks everything dirty anyway, and Join clears it.
-- Existing public ids (`legacy:*`, 32-hex) are NOT rewritten here; Start does it.
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`device_id` text,
	`server_url` text,
	`token` text,
	`cursor` text,
	`last_synced_at` text,
	`last_error` text,
	`enabled` integer DEFAULT 0 NOT NULL,
	`consent_at` text,
	`consent_app_version` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	CONSTRAINT "sync_state_single_row" CHECK("id" = 1)
);--> statement-breakpoint
INSERT INTO `sync_state` (`id`) VALUES (1);--> statement-breakpoint
ALTER TABLE `account_reconciliations` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `account_reconciliations` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `account_reconciliations` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `account_reconciliations` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `budget_allocations` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `budget_allocations` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `budget_allocations` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `budget_allocations` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `budget_transfers` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `budget_transfers` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `budget_transfers` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `budget_transfers` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `categories` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `envelope_categories` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `envelope_categories` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `envelope_categories` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `envelope_categories` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `envelopes` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `envelopes` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `envelopes` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `envelopes` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payees` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `payees` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payees` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payees` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_transactions` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `scheduled_transactions` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_transactions` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scheduled_transactions` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `hlc` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `sync_dirty` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `sync_unsealed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `sync_rev` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP TRIGGER IF EXISTS `account_reconciliations_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `account_reconciliations_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `accounts_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `accounts_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `budget_allocations_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `budget_allocations_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `budget_transfers_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `budget_transfers_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `categories_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `categories_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `envelope_categories_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `envelope_categories_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `envelopes_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `envelopes_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `payees_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `payees_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `scheduled_transactions_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `scheduled_transactions_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `transactions_sync_metadata_insert`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `transactions_sync_metadata_update`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `envelope_categories_created_at_insert`;--> statement-breakpoint
CREATE TRIGGER `account_reconciliations_sync_metadata_insert` AFTER INSERT ON `account_reconciliations`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `account_reconciliations` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `accounts_sync_metadata_insert` AFTER INSERT ON `accounts`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `accounts` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `budget_allocations_sync_metadata_insert` AFTER INSERT ON `budget_allocations`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `budget_allocations` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `budget_transfers_sync_metadata_insert` AFTER INSERT ON `budget_transfers`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `budget_transfers` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `categories_sync_metadata_insert` AFTER INSERT ON `categories`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `categories` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `envelope_categories_sync_metadata_insert` AFTER INSERT ON `envelope_categories`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `envelope_categories` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `envelopes_sync_metadata_insert` AFTER INSERT ON `envelopes`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `envelopes` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `payees_sync_metadata_insert` AFTER INSERT ON `payees`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `payees` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `scheduled_transactions_sync_metadata_insert` AFTER INSERT ON `scheduled_transactions`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `scheduled_transactions` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `transactions_sync_metadata_insert` AFTER INSERT ON `transactions`
WHEN NEW.hlc IS NULL
BEGIN
	UPDATE `transactions` SET
		public_id = COALESCE(NEW.public_id, lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (random() & 3), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)))),
		updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP),
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `envelope_categories_created_at_insert` AFTER INSERT ON `envelope_categories`
WHEN NEW.created_at IS NULL
BEGIN
	UPDATE `envelope_categories` SET created_at = CURRENT_TIMESTAMP, sync_rev = sync_rev + 1 WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `account_reconciliations_sync_metadata_update` AFTER UPDATE ON `account_reconciliations`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `account_reconciliations` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `accounts_sync_metadata_update` AFTER UPDATE ON `accounts`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `accounts` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `budget_allocations_sync_metadata_update` AFTER UPDATE ON `budget_allocations`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `budget_allocations` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `budget_transfers_sync_metadata_update` AFTER UPDATE ON `budget_transfers`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `budget_transfers` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `categories_sync_metadata_update` AFTER UPDATE ON `categories`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `categories` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `envelope_categories_sync_metadata_update` AFTER UPDATE ON `envelope_categories`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `envelope_categories` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `envelopes_sync_metadata_update` AFTER UPDATE ON `envelopes`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `envelopes` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `payees_sync_metadata_update` AFTER UPDATE ON `payees`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `payees` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `scheduled_transactions_sync_metadata_update` AFTER UPDATE ON `scheduled_transactions`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `scheduled_transactions` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER `transactions_sync_metadata_update` AFTER UPDATE ON `transactions`
WHEN NEW.sync_rev IS OLD.sync_rev
BEGIN
	UPDATE `transactions` SET
		updated_at = CASE WHEN NEW.updated_at IS OLD.updated_at THEN CURRENT_TIMESTAMP ELSE updated_at END,
		sync_dirty = 1,
		sync_unsealed = 1,
		sync_rev = sync_rev + 1
	WHERE id = NEW.id;
END;
