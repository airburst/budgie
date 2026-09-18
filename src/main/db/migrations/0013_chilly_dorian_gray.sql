ALTER TABLE `account_reconciliations` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `account_reconciliations` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `account_reconciliations` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `accounts` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `budget_allocations` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `budget_allocations` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `budget_allocations` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `budget_transfers` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `budget_transfers` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `budget_transfers` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `envelope_categories` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `envelope_categories` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `envelope_categories` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `envelope_categories` ADD `created_at` text DEFAULT (CURRENT_TIMESTAMP);--> statement-breakpoint
ALTER TABLE `envelopes` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `envelopes` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `envelopes` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `payees` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `payees` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `payees` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `scheduled_transactions` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `scheduled_transactions` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `scheduled_transactions` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `deleted_at` text;--> statement-breakpoint
UPDATE `account_reconciliations` SET `public_id` = 'legacy:account_reconciliations:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `accounts` SET `public_id` = 'legacy:accounts:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `budget_allocations` SET `public_id` = 'legacy:budget_allocations:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `budget_transfers` SET `public_id` = 'legacy:budget_transfers:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `categories` SET `public_id` = 'legacy:categories:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `envelope_categories` SET `public_id` = 'legacy:envelope_categories:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `envelopes` SET `public_id` = 'legacy:envelopes:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `payees` SET `public_id` = 'legacy:payees:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `scheduled_transactions` SET `public_id` = 'legacy:scheduled_transactions:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `transactions` SET `public_id` = 'legacy:transactions:' || `id` WHERE `public_id` IS NULL;--> statement-breakpoint
UPDATE `account_reconciliations` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `accounts` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `budget_allocations` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `budget_transfers` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `categories` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `envelope_categories` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `envelopes` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `payees` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `scheduled_transactions` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `transactions` SET `updated_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `updated_at` IS NULL;--> statement-breakpoint
UPDATE `accounts` SET `deleted_at` = COALESCE(`updated_at`, CURRENT_TIMESTAMP) WHERE `deleted` = 1 AND `deleted_at` IS NULL;--> statement-breakpoint
UPDATE `categories` SET `deleted_at` = COALESCE(`updated_at`, CURRENT_TIMESTAMP) WHERE `deleted` = 1 AND `deleted_at` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `account_reconciliations_public_id_idx` ON `account_reconciliations` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `accounts_public_id_idx` ON `accounts` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `budget_allocations_public_id_idx` ON `budget_allocations` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `budget_transfers_public_id_idx` ON `budget_transfers` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `categories_public_id_idx` ON `categories` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `envelope_categories_public_id_idx` ON `envelope_categories` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `envelopes_public_id_idx` ON `envelopes` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `payees_public_id_idx` ON `payees` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `scheduled_transactions_public_id_idx` ON `scheduled_transactions` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `transactions_public_id_idx` ON `transactions` (`public_id`);--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `account_reconciliations_sync_metadata_insert` AFTER INSERT ON `account_reconciliations`
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE account_reconciliations SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `accounts_sync_metadata_insert` AFTER INSERT ON `accounts`
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE accounts SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `budget_allocations_sync_metadata_insert` AFTER INSERT ON `budget_allocations`
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE budget_allocations SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `budget_transfers_sync_metadata_insert` AFTER INSERT ON `budget_transfers`
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE budget_transfers SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `categories_sync_metadata_insert` AFTER INSERT ON categories
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE categories SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `envelope_categories_sync_metadata_insert` AFTER INSERT ON envelope_categories
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE envelope_categories SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `envelopes_sync_metadata_insert` AFTER INSERT ON envelopes
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE envelopes SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `payees_sync_metadata_insert` AFTER INSERT ON payees
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE payees SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `scheduled_transactions_sync_metadata_insert` AFTER INSERT ON scheduled_transactions
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE scheduled_transactions SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `transactions_sync_metadata_insert` AFTER INSERT ON transactions
WHEN NEW.public_id IS NULL OR NEW.updated_at IS NULL
BEGIN
	UPDATE transactions SET public_id = COALESCE(NEW.public_id, lower(hex(randomblob(16)))), updated_at = COALESCE(NEW.updated_at, CURRENT_TIMESTAMP) WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `account_reconciliations_sync_metadata_update` AFTER UPDATE ON account_reconciliations
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE account_reconciliations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `accounts_sync_metadata_update` AFTER UPDATE ON accounts
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `budget_allocations_sync_metadata_update` AFTER UPDATE ON budget_allocations
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE budget_allocations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `budget_transfers_sync_metadata_update` AFTER UPDATE ON budget_transfers
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE budget_transfers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `categories_sync_metadata_update` AFTER UPDATE ON categories
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `envelope_categories_sync_metadata_update` AFTER UPDATE ON envelope_categories
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE envelope_categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `envelopes_sync_metadata_update` AFTER UPDATE ON envelopes
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE envelopes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `payees_sync_metadata_update` AFTER UPDATE ON payees
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE payees SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `scheduled_transactions_sync_metadata_update` AFTER UPDATE ON scheduled_transactions
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE scheduled_transactions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `transactions_sync_metadata_update` AFTER UPDATE ON transactions
WHEN NEW.updated_at = OLD.updated_at
BEGIN
	UPDATE transactions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `account_reconciliations_no_hard_delete` BEFORE DELETE ON account_reconciliations
BEGIN
	SELECT RAISE(ABORT, 'account_reconciliations must be tombstoned');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `accounts_no_hard_delete` BEFORE DELETE ON accounts
BEGIN
	SELECT RAISE(ABORT, 'accounts must be tombstoned');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `budget_allocations_no_hard_delete` BEFORE DELETE ON budget_allocations
BEGIN
	SELECT RAISE(ABORT, 'budget_allocations must be tombstoned');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `budget_transfers_no_hard_delete` BEFORE DELETE ON budget_transfers
BEGIN
	SELECT RAISE(ABORT, 'budget_transfers must be tombstoned');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `categories_no_hard_delete` BEFORE DELETE ON categories
BEGIN
	SELECT RAISE(ABORT, 'categories must be tombstoned');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `envelope_categories_no_hard_delete` BEFORE DELETE ON envelope_categories
BEGIN
	SELECT RAISE(ABORT, 'envelope_categories must be tombstoned');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `envelopes_no_hard_delete` BEFORE DELETE ON envelopes
BEGIN
	SELECT RAISE(ABORT, 'envelopes must be tombstoned');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `payees_no_hard_delete` BEFORE DELETE ON payees
BEGIN
	SELECT RAISE(ABORT, 'payees must be tombstoned');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `scheduled_transactions_no_hard_delete` BEFORE DELETE ON scheduled_transactions
BEGIN
	SELECT RAISE(ABORT, 'scheduled_transactions must be tombstoned');
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `transactions_no_hard_delete` BEFORE DELETE ON transactions
BEGIN
	SELECT RAISE(ABORT, 'transactions must be tombstoned');
END;