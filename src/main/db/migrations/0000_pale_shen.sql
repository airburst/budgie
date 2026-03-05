CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content` text NOT NULL,
	`completed` integer DEFAULT false,
	`created_at` text DEFAULT '2026-03-05T17:32:41.907Z'
);
