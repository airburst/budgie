# Envelope Budgeting — Design Spec

## Core concept

Every pound of income gets assigned to an envelope. The central number is **Available to Budget** (ATB):

```
ATB = total income for month
    − total assigned across all envelopes
    − uncovered overspends from prior months
```

When ATB hits £0, every pound has a job. Envelopes are separate from categories — categories classify transactions for reporting; envelopes plan where money goes.

---

## Data model

### `envelopes`

| Column     | Type              | Notes                                                            |
| ---------- | ----------------- | ---------------------------------------------------------------- |
| id         | integer PK        | auto-increment                                                   |
| name       | text NOT NULL     | e.g. "Food", "Mortgage"                                          |
| active     | integer (boolean) | default true; soft delete                                        |
| sort_order | integer           | default 0; flat reorderable list                                 |
| created_at | text              | SQL default `(CURRENT_TIMESTAMP)` — doubles as budget start date |

### `envelope_categories` (mapping)

| Column      | Type                    | Notes                                                    |
| ----------- | ----------------------- | -------------------------------------------------------- |
| id          | integer PK              | auto-increment                                           |
| envelope_id | integer FK → envelopes  | NOT NULL                                                 |
| category_id | integer FK → categories | NOT NULL, UNIQUE — each category in at most one envelope |

### `budget_allocations`

| Column      | Type                   | Notes            |
| ----------- | ---------------------- | ---------------- |
| id          | integer PK             | auto-increment   |
| envelope_id | integer FK → envelopes | NOT NULL         |
| month       | text NOT NULL          | `YYYY-MM` format |
| assigned    | real NOT NULL          | default 0        |
| created_at  | text                   | SQL default      |

Unique constraint: `(envelope_id, month)`.

### `budget_transfers` (move money audit trail)

| Column           | Type                   | Notes                      |
| ---------------- | ---------------------- | -------------------------- |
| id               | integer PK             | auto-increment             |
| from_envelope_id | integer FK → envelopes | NOT NULL                   |
| to_envelope_id   | integer FK → envelopes | NOT NULL                   |
| month            | text NOT NULL          | `YYYY-MM`                  |
| amount           | real NOT NULL          | always positive; CHECK > 0 |
| notes            | text                   | optional                   |
| created_at       | text                   | SQL default                |

### No changes to existing tables

---

## Indexes

```sql
CREATE INDEX idx_envelope_categories_envelope ON envelope_categories(envelope_id);
CREATE INDEX idx_envelope_categories_category ON envelope_categories(category_id);
CREATE INDEX idx_budget_alloc_month ON budget_allocations(month);
CREATE INDEX idx_budget_alloc_envelope_month ON budget_allocations(envelope_id, month);
CREATE INDEX idx_budget_transfers_month ON budget_transfers(month);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account_date ON transactions(account_id, date);
```

The `category_id` index supports the activity computation (looking up which envelope a category belongs to). The two transaction indexes are shared with the reports feature.

---

## Definitions

### Income

Income = sum of transaction amounts where the transaction's category has `expenseType = 'income'`, for the given month. Transactions with `expenseType = 'transfer'` or `categoryId = NULL` are excluded from income.

### Transaction amount sign convention

Amounts on `transactions` are signed: negative = money out (expenses), positive = money in (income). This is the existing convention used throughout the app (e.g. transfer handler creates counter-transaction with `-txData.amount`).

### Envelope category constraint

Only categories with `expenseType = 'expense'` may be mapped to envelopes. The IPC handler for `envelope_categories:create` must validate this. Income and transfer categories are never mapped — income feeds the ATB pool directly, transfers are excluded entirely.

---

## Computed values (never stored)

- **Activity** = sum of all transactions whose `category_id` is mapped to the envelope, for the given month (will be negative for spending)
- **Transfers in** = sum of `budget_transfers.amount` where `to_envelope_id` = this envelope, for the month
- **Transfers out** = sum of `budget_transfers.amount` where `from_envelope_id` = this envelope, for the month
- **Available** = assigned + activity + transfers_in − transfers_out + rolled_over_balance
- **Rolled-over balance**: positive balances carry forward from prior month. Negative balances (overspends) reset to £0 — the deficit reduces next month's Available to Budget instead.
- **Available to Budget** = income for month − sum(all assigned) − sum(uncovered overspends from prior months)
- **Overspend cascade**: an overspend in month M reduces only month M+1's ATB. If M+1 also overspends, that is a new overspend affecting M+2. No recursive cascade — each month is computed iteratively forward from the envelope's start month.
- **Rollover lookback** starts from the envelope's `created_at` month — no history before that

---

## Key behaviours

### Income assignment

- Income-type transactions increase the Available to Budget pool
- User manually distributes from the pool to envelopes
- **Quick-fill button**: copies last month's allocation amounts as a starting point; user adjusts
- Quick-fill only populates active envelopes that had allocations last month
- If current month already has partial allocations, Quick Fill only creates rows for envelopes that have **no `budget_allocations` row** for the month — does not overwrite existing rows (even if assigned = £0, which means the user intentionally set it to zero)

### Move money

- Transfer between two envelopes within a month
- Creates a `budget_transfers` row (audit trail)
- Available to Budget unchanged (zero-sum)
- Self-transfers prevented (CHECK constraint: `from_envelope_id != to_envelope_id`)

### Overspend at month-end

- Overspent envelope resets to £0 for the new month
- The deficit reduces next month's Available to Budget
- Overspent envelopes highlighted in red

### Category reassignment

- Moving a category from one envelope to another is **retroactive** — all historical months recompute
- Accepted trade-off: past numbers shift when mappings change

### Envelope deletion

- Soft delete via `active` flag (set to false)
- Inactive envelopes hidden from budget view but preserved for historical data
- Mapped categories become unmapped — UI warns before deactivating
- Allocations and transfers preserved
- Transfer audit trail renders inactive envelope names with "(deleted)" suffix
- **Note**: deactivating an envelope causes its historically-budgeted spending to retroactively appear as unbudgeted (consequence of retroactive category reassignment model)

### Transfer-type categories

- Excluded from budgeting entirely

### Unbudgeted spending

- Transactions in categories not mapped to any envelope are summed in an "Unbudgeted Spending" section at the bottom of the budget page
- This makes money leakage visible

### Underfunded warning

- When an envelope's assigned amount is less than upcoming scheduled payments for its mapped categories, show a warning icon
- Uses existing `scheduled_transactions` data — sum amounts where `category_id` is in the envelope's mapped categories and `next_due_date` falls within the month

---

## Budget page layout

```
Available to Budget: £420.00        [Quick Fill] [< Feb | March 2026 | Apr >]

┌────────────────────────────────────────────────────────────────┐
│  Food           Assigned: £420  ████████████░░░  £245/£420  ⚠  │
│                 Groceries · Dining Out · Wine                   │
├────────────────────────────────────────────────────────────────┤
│  Mortgage       Assigned: £850  ████████████████  £850/£850    │
│                 Mortgage                                        │
├────────────────────────────────────────────────────────────────┤
│  Utilities      Assigned: £120  ████████░░░░░░░  £95/£120     │
│                 Electric · Gas · Water                          │
├────────────────────────────────────────────────────────────────┤
│  ...                                                           │
├────────────────────────────────────────────────────────────────┤
│  Unbudgeted Spending                              −£34.50      │
│  Parking · Cash withdrawal                                     │
└────────────────────────────────────────────────────────────────┘
```

- Each envelope row shows: name, assigned (inline-editable), progress bar (shadcn Progress), activity/assigned amounts
- Progress bar: green <80%, amber 80–100%, red >100%
- ⚠ icon = underfunded (scheduled payments exceed assigned)
- Mapped categories listed as muted text below envelope name
- Right-click or button → "Move money to/from this envelope"
- Unbudgeted Spending section at bottom shows unmapped category activity
- Month selector navigates between months

### Envelope management

- "New Envelope" button opens form: name + category picker (multi-select, shows hierarchy, greys out already-mapped categories)
- Edit envelope: rename, add/remove category mappings, reorder
- Delete envelope: confirmation warning that categories will be unmapped, then soft-delete

### First-month onboarding

- Empty state when no envelopes exist: guided setup flow
- Quick-fill disabled on first month (nothing to copy)

### Budget templates

On first visit (no envelopes exist), offer a "Start with a template" option alongside "Create from scratch". Templates pre-create envelopes and map seed categories:

| Template     | Envelopes created                                                                   | Mapped seed categories                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Starter**  | Bills, Food, Transport, Savings, Personal                                           | Bills + children → Bills; Food > Groceries → Food; Motoring + children → Transport; Clothing, Entertainment, Fitness → Personal |
| **Detailed** | Mortgage/Rent, Utilities, Insurance, Food, Transport, Healthcare, Personal, Savings | Finer-grained mapping using the full seed category tree                                                                         |
| **Minimal**  | Essentials, Everything Else, Savings                                                | Broad two-bucket + savings split                                                                                                |

Templates are defined as JSON in the renderer (not in the DB). User can edit/delete any template-created envelope after setup. Template selection is a one-time onboarding step — once envelopes exist, the empty state is replaced by the normal budget view.

---

## Impact on reports plan

- **Remove** all `budgetClass` / 50/30/20 references from reports-page.md
- **Add** Budget vs Actual chart: per-envelope assigned vs spent, grouped bar chart by month
- Spending by Category donut — unchanged (categories still exist for classification)
- Income vs Expenses bar — unchanged
- Shared `transactions:getByDateRange` IPC — unchanged and still needed

---

## Migration SQL

Single migration `0009_envelope_budgeting.sql`:

```sql
CREATE TABLE `envelopes` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `name` TEXT NOT NULL,
  `active` INTEGER NOT NULL DEFAULT 1,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` TEXT DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE `envelope_categories` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `envelope_id` INTEGER NOT NULL REFERENCES `envelopes`(`id`) ON DELETE RESTRICT,
  `category_id` INTEGER NOT NULL REFERENCES `categories`(`id`) ON DELETE RESTRICT,
  UNIQUE(`category_id`)
);

CREATE TABLE `budget_allocations` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `envelope_id` INTEGER NOT NULL REFERENCES `envelopes`(`id`) ON DELETE RESTRICT,
  `month` TEXT NOT NULL,
  `assigned` REAL NOT NULL DEFAULT 0,
  `created_at` TEXT DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(`envelope_id`, `month`)
);

CREATE TABLE `budget_transfers` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `from_envelope_id` INTEGER NOT NULL REFERENCES `envelopes`(`id`) ON DELETE RESTRICT,
  `to_envelope_id` INTEGER NOT NULL REFERENCES `envelopes`(`id`) ON DELETE RESTRICT,
  `month` TEXT NOT NULL,
  `amount` REAL NOT NULL CHECK(`amount` > 0),
  `notes` TEXT,
  `created_at` TEXT DEFAULT (CURRENT_TIMESTAMP),
  CHECK(`from_envelope_id` != `to_envelope_id`)
);

CREATE INDEX `idx_envelope_categories_envelope` ON `envelope_categories`(`envelope_id`);
CREATE INDEX `idx_envelope_categories_category` ON `envelope_categories`(`category_id`);
CREATE INDEX `idx_budget_alloc_month` ON `budget_allocations`(`month`);
CREATE INDEX `idx_budget_alloc_envelope_month` ON `budget_allocations`(`envelope_id`, `month`);
CREATE INDEX `idx_budget_transfers_month` ON `budget_transfers`(`month`);
CREATE INDEX `idx_transactions_date` ON `transactions`(`date`);
CREATE INDEX `idx_transactions_account_date` ON `transactions`(`account_id`, `date`);
```

---

## IPC handlers needed

Following CLAUDE.md one-file-per-entity pattern:

- `public/ipc/envelopes.js` — CRUD for envelopes
- `public/ipc/envelope-categories.js` — CRUD for mappings
- `public/ipc/budget-allocations.js` — CRUD for allocations + "quick fill from last month" handler
- `public/ipc/budget-transfers.js` — CRUD for transfers

---

## Deferred to v2

- **Credit card payment envelopes** — auto-created CC envelopes with type/account_id fields, transfer handling, unbudgeted CC debt logic
- **Budget goals** — separate entity linked to envelopes (target amount, target date, goal type)
- **Envelope groups** — collapsible grouping in the UI
- **Budget vs Actual report** — could ship with v1 reports but listed as optional

---

## Verification

1. `bun run vite build --config vite.main.config.ts` — rebuilds db.js
2. `bun run lint && bun run check-types` — clean
3. `bun run test` — all pass (new integration tests for envelope CRUD, allocation logic, rollover computation)
4. Manual: create envelopes, map categories, assign money for a month
5. Manual: quick-fill from last month works
6. Manual: move money between envelopes, verify audit trail
7. Manual: overspend in one month → next month ATB reduced
8. Manual: unbudgeted spending section shows unmapped category activity
9. Manual: underfunded warning appears when scheduled payments exceed assigned
10. Manual: deactivate envelope → hidden from view, categories unmapped
