ALTER TABLE `accounts` ADD COLUMN `pending_reconcile_balance` real;
--> statement-breakpoint
ALTER TABLE `accounts` ADD COLUMN `pending_reconcile_date` text;
