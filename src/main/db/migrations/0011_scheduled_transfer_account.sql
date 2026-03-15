ALTER TABLE `scheduled_transactions` ADD COLUMN `transfer_to_account_id` integer REFERENCES `accounts`(`id`);
