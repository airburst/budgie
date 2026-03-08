-- Seed default categories derived from Export.csv
--
-- "Run only once" guarantees:
--   1. The Drizzle migration framework records this migration in __drizzle_migrations
--      and will never apply it a second time to the same database.
--   2. The WHERE NOT EXISTS guards below provide a secondary safety net for databases
--      that already had user-entered data before this migration was introduced:
--        - Parent insert: skipped if categories table contains any rows at all.
--        - Child insert:  skipped if any sub-categories (parent_id IS NOT NULL) already
--          exist; parent lookup via JOIN means it is also a no-op if none of the seeded
--          parent names are present.

-- Insert all top-level categories in a single statement.
-- The WHERE NOT EXISTS ensures this is skipped on any non-empty database.
INSERT INTO `categories` (`name`, `expense_type`)
SELECT name, expense_type FROM (
  SELECT 'Allowance'          AS name, 'expense' AS expense_type  UNION ALL
  SELECT 'Bank charge',              'expense'                    UNION ALL
  SELECT 'Bills',                    'expense'                    UNION ALL
  SELECT 'Business expense',         'expense'                    UNION ALL
  SELECT 'Cash withdrawal',          'expense'                    UNION ALL
  SELECT 'Charitable donation',      'expense'                    UNION ALL
  SELECT 'Clothing',                 'expense'                    UNION ALL
  SELECT 'Council Tax',              'expense'                    UNION ALL
  SELECT 'Education',                'expense'                    UNION ALL
  SELECT 'Entertainment',            'expense'                    UNION ALL
  SELECT 'Fitness',                  'expense'                    UNION ALL
  SELECT 'Food',                     'expense'                    UNION ALL
  SELECT 'Gifts',                    'expense'                    UNION ALL
  SELECT 'Healthcare',               'expense'                    UNION ALL
  SELECT 'Holiday',                  'expense'                    UNION ALL
  SELECT 'Home',                     'expense'                    UNION ALL
  SELECT 'Household',                'expense'                    UNION ALL
  SELECT 'Insurance',                'expense'                    UNION ALL
  SELECT 'Interest',                 'income'                     UNION ALL
  SELECT 'Loan',                     'expense'                    UNION ALL
  SELECT 'Miscellaneous',            'expense'                    UNION ALL
  SELECT 'Mobile',                   'expense'                    UNION ALL
  SELECT 'Motoring',                 'expense'                    UNION ALL
  SELECT 'Other income',             'income'                     UNION ALL
  SELECT 'Parking',                  'expense'                    UNION ALL
  SELECT 'Personal care',            'expense'                    UNION ALL
  SELECT 'Pet care',                 'expense'                    UNION ALL
  SELECT 'Pets',                     'expense'                    UNION ALL
  SELECT 'Retirement income',        'income'                     UNION ALL
  SELECT 'Salary',                   'income'                     UNION ALL
  SELECT 'School',                   'expense'                    UNION ALL
  SELECT 'Taxes',                    'expense'                    UNION ALL
  SELECT 'Transfer',                 'transfer'                   UNION ALL
  SELECT 'Travel',                   'expense'
) WHERE NOT EXISTS (SELECT 1 FROM `categories` LIMIT 1);
--> statement-breakpoint

-- Insert all sub-categories in a single statement.
-- The WHERE NOT EXISTS guard skips this if any sub-categories already exist.
-- The JOIN on parent name means this is also a no-op when the parent-insert above
-- was skipped (no top-level categories with these names would be present).
INSERT INTO `categories` (`parent_id`, `name`, `expense_type`)
SELECT p.`id`, c.child_name, c.expense_type
FROM (
  SELECT 'Bills'             AS parent_name, 'Broadband'       AS child_name, 'expense' AS expense_type UNION ALL
  SELECT 'Bills',                            'Cable/satellite',               'expense'                  UNION ALL
  SELECT 'Bills',                            'Electric',                      'expense'                  UNION ALL
  SELECT 'Bills',                            'Garbage',                       'expense'                  UNION ALL
  SELECT 'Bills',                            'Gas',                           'expense'                  UNION ALL
  SELECT 'Bills',                            'Homeowners dues',               'expense'                  UNION ALL
  SELECT 'Bills',                            'Internet',                      'expense'                  UNION ALL
  SELECT 'Bills',                            'Mortgage',                      'expense'                  UNION ALL
  SELECT 'Bills',                            'Phone',                         'expense'                  UNION ALL
  SELECT 'Bills',                            'Rent',                          'expense'                  UNION ALL
  SELECT 'Bills',                            'Water/sewer',                   'expense'                  UNION ALL
  SELECT 'Business expense',                 'Non-reimbursed',                'expense'                  UNION ALL
  SELECT 'Business expense',                 'Reimbursed',                    'expense'                  UNION ALL
  SELECT 'Food',                             'Dining out',                    'expense'                  UNION ALL
  SELECT 'Food',                             'Groceries',                     'expense'                  UNION ALL
  SELECT 'Food',                             'Wine',                          'expense'                  UNION ALL
  SELECT 'Healthcare',                       'Dental',                        'expense'                  UNION ALL
  SELECT 'Healthcare',                       'Hospital',                      'expense'                  UNION ALL
  SELECT 'Healthcare',                       'Prescriptions',                 'expense'                  UNION ALL
  SELECT 'Healthcare',                       'Vision',                        'expense'                  UNION ALL
  SELECT 'Household',                        'Maintenance',                   'expense'                  UNION ALL
  SELECT 'Insurance',                        'Car',                           'expense'                  UNION ALL
  SELECT 'Insurance',                        'Health',                        'expense'                  UNION ALL
  SELECT 'Insurance',                        'Home',                          'expense'                  UNION ALL
  SELECT 'Insurance',                        'Life',                          'expense'                  UNION ALL
  SELECT 'Loan',                             'Payment',                       'expense'                  UNION ALL
  SELECT 'Motoring',                         'Fuel',                          'expense'                  UNION ALL
  SELECT 'Motoring',                         'Servicing',                     'expense'                  UNION ALL
  SELECT 'Motoring',                         'Tax',                           'expense'
) AS c
JOIN `categories` p ON p.`name` = c.parent_name AND p.`parent_id` IS NULL
WHERE NOT EXISTS (SELECT 1 FROM `categories` WHERE `parent_id` IS NOT NULL LIMIT 1);
