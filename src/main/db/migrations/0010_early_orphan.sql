DROP INDEX `idx_budget_alloc_month`;--> statement-breakpoint
DROP INDEX `idx_budget_alloc_envelope_month`;--> statement-breakpoint
DROP INDEX `idx_budget_transfers_month`;--> statement-breakpoint
DROP INDEX `idx_envelope_categories_envelope`;--> statement-breakpoint
DROP INDEX `idx_envelope_categories_category`;--> statement-breakpoint
DROP INDEX `idx_transactions_date`;--> statement-breakpoint
DROP INDEX `idx_transactions_account_date`;--> statement-breakpoint
ALTER TABLE `accounts` ADD `deleted` integer DEFAULT false NOT NULL;