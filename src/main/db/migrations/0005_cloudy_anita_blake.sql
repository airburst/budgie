ALTER TABLE `categories` ADD COLUMN `parent_id` integer REFERENCES `categories`(`id`);
