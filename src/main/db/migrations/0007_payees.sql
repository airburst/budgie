CREATE TABLE `payees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category_id` integer REFERENCES `categories`(`id`),
	`amount` real,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payees_name_unique` ON `payees` (`name`);
