-- Add transfer_transaction_id to transactions for double-entry bookkeeping
ALTER TABLE `transactions` ADD COLUMN `transfer_transaction_id` INTEGER REFERENCES `transactions`(`id`);
--> statement-breakpoint

-- Seed Transfer top-level category (idempotent)
INSERT INTO `categories` (`name`, `expense_type`)
SELECT 'Transfer', 'transfer'
WHERE NOT EXISTS (
  SELECT 1 FROM `categories` WHERE `name` = 'Transfer' AND `parent_id` IS NULL
);
--> statement-breakpoint

-- Seed Transfer sub-categories for every existing account (idempotent)
INSERT INTO `categories` (`parent_id`, `name`, `expense_type`)
SELECT t.`id`, a.`name`, 'transfer'
FROM `categories` t
CROSS JOIN `accounts` a
WHERE t.`name` = 'Transfer' AND t.`parent_id` IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM `categories` c
    WHERE c.`parent_id` = t.`id` AND c.`name` = a.`name`
  );
