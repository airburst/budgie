CREATE TABLE `envelopes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `envelope_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`envelope_id` integer NOT NULL REFERENCES `envelopes`(`id`) ON DELETE RESTRICT,
	`category_id` integer NOT NULL REFERENCES `categories`(`id`) ON DELETE RESTRICT,
	UNIQUE(`category_id`)
);
--> statement-breakpoint
CREATE TABLE `budget_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`envelope_id` integer NOT NULL REFERENCES `envelopes`(`id`) ON DELETE RESTRICT,
	`month` text NOT NULL,
	`assigned` real DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	UNIQUE(`envelope_id`, `month`)
);
--> statement-breakpoint
CREATE TABLE `budget_transfers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_envelope_id` integer NOT NULL REFERENCES `envelopes`(`id`) ON DELETE RESTRICT,
	`to_envelope_id` integer NOT NULL REFERENCES `envelopes`(`id`) ON DELETE RESTRICT,
	`month` text NOT NULL,
	`amount` real NOT NULL CHECK(`amount` > 0),
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	CHECK(`from_envelope_id` != `to_envelope_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_envelope_categories_envelope` ON `envelope_categories`(`envelope_id`);
--> statement-breakpoint
CREATE INDEX `idx_envelope_categories_category` ON `envelope_categories`(`category_id`);
--> statement-breakpoint
CREATE INDEX `idx_budget_alloc_month` ON `budget_allocations`(`month`);
--> statement-breakpoint
CREATE INDEX `idx_budget_alloc_envelope_month` ON `budget_allocations`(`envelope_id`, `month`);
--> statement-breakpoint
CREATE INDEX `idx_budget_transfers_month` ON `budget_transfers`(`month`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions`(`date`);
--> statement-breakpoint
CREATE INDEX `idx_transactions_account_date` ON `transactions`(`account_id`, `date`);
