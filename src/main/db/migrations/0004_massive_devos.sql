CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`icon` text,
	`created_at` text DEFAULT '2026-03-07T07:39:38.665Z'
);
--> statement-breakpoint
CREATE TABLE `scheduled_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`category_id` integer,
	`payee` text NOT NULL,
	`amount` real NOT NULL,
	`rrule` text NOT NULL,
	`next_due_date` text,
	`auto_post` integer DEFAULT false NOT NULL,
	`notes` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '2026-03-07T07:39:38.665Z',
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`category_id` integer,
	`date` text NOT NULL,
	`payee` text NOT NULL,
	`amount` real NOT NULL,
	`notes` text,
	`cleared` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT '2026-03-07T07:39:38.665Z',
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`number` text,
	`type` text NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'GBP' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT '2026-03-07T07:39:38.664Z'
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "name", "number", "type", "balance", "currency", "notes", "created_at") SELECT "id", "name", "number", "type", "balance", "currency", "notes", "created_at" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;