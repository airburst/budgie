# Envelope Budgeting Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add envelope-based zero-sum budgeting — users assign every pound of income to envelopes, track spending per envelope, and see Available to Budget reach £0.

**Architecture:** 4 new DB tables (envelopes, envelope_categories, budget_allocations, budget_transfers). IPC handlers follow one-file-per-entity pattern. Computation (ATB, activity, rollover) is client-side via a `useBudgetSummary` hook. Budget page at `/budget` with inline-editable allocations and progress bars.

**Tech Stack:** SQLite + Drizzle ORM (backend), React 19 + TanStack Query v5 + shadcn/base-ui + Recharts (frontend)

**Spec:** `docs/superpowers/specs/2026-03-12-envelope-budgeting-design.md`

---

## File Map

### New files

| File                                                 | Responsibility                                               |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `src/main/db/migrations/0009_envelope_budgeting.sql` | Migration: 4 tables + 7 indexes                              |
| `src/main/db/migrations/meta/0009_snapshot.json`     | Drizzle snapshot                                             |
| `public/ipc/envelopes.js`                            | CRUD for envelopes                                           |
| `public/ipc/envelope-categories.js`                  | CRUD for envelope↔category mappings                          |
| `public/ipc/budget-allocations.js`                   | CRUD + quick-fill for allocations                            |
| `public/ipc/budget-transfers.js`                     | CRUD for move-money transfers                                |
| `src/hooks/useEnvelopes.ts`                          | TanStack Query hook for envelope CRUD                        |
| `src/hooks/useEnvelopeCategories.ts`                 | Hook for envelope↔category mappings                          |
| `src/hooks/useBudgetAllocations.ts`                  | Hook for allocations + quick-fill                            |
| `src/hooks/useBudgetTransfers.ts`                    | Hook for move-money transfers                                |
| `src/hooks/useBudgetSummary.ts`                      | Computed: ATB, activity, available, rollover, underfunded    |
| `src/pages/Budget/BudgetPage.tsx`                    | Main budget page                                             |
| `src/pages/Budget/EnvelopeRow.tsx`                   | Single envelope row: name, assigned input, progress, amounts |
| `src/pages/Budget/MonthSelector.tsx`                 | Month navigation: < prev \| "March 2026" \| next >           |
| `src/pages/Budget/MoveMoneyDialog.tsx`               | Dialog for moving money between envelopes                    |
| `src/pages/Budget/EnvelopeFormDialog.tsx`            | Create/edit envelope dialog with category picker             |
| `src/pages/Budget/UnbudgetedSection.tsx`             | Shows spend on unmapped categories                           |
| `src/pages/Budget/BudgetOnboarding.tsx`              | Empty state: template picker or "create from scratch"        |
| `src/pages/Budget/budget-templates.ts`               | Template definitions (Starter, Detailed, Minimal) as JSON    |
| `src/tests/integration/envelopes.test.ts`            | Integration tests for envelopes + mappings                   |
| `src/tests/integration/budget-allocations.test.ts`   | Integration tests for allocations + quick-fill               |
| `src/tests/integration/budget-transfers.test.ts`     | Integration tests for transfers                              |
| `src/tests/unit/budget-summary.unit.test.ts`         | Unit tests for ATB/activity/rollover computation             |

### Modified files

| File                                        | Change                                |
| ------------------------------------------- | ------------------------------------- |
| `src/main/db/schema.ts`                     | Add 4 table definitions               |
| `src/main/db/migrations/meta/_journal.json` | Add idx 9 entry                       |
| `public/electron.js`                        | Import + register 4 new handler files |
| `public/preload.js`                         | Expose ~20 new API methods            |
| `src/types/electron.d.ts`                   | Add 4 types + ~20 interface methods   |
| `src/App.tsx`                               | Add `/budget` route                   |
| `src/components/header.tsx`                 | Add "Budget" nav link                 |
| `src/tests/integration/helpers/ipc.ts`      | Register 4 new handler files          |
| `src/tests/integration/helpers/fixtures.ts` | Add envelope + allocation fixtures    |

---

## Chunk 1: Schema, Migration, DB Rebuild

### Task 1: Add table definitions to schema.ts

**Files:**

- Modify: `src/main/db/schema.ts:92` (append after payees table)

- [ ] **Step 1: Add 4 table definitions to schema.ts**

Append after the `payees` table:

```ts
export const envelopes = sqliteTable("envelopes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const envelopeCategories = sqliteTable("envelope_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  envelopeId: integer("envelope_id")
    .notNull()
    .references(() => envelopes.id),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id)
    .unique(),
});

export const budgetAllocations = sqliteTable("budget_allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  envelopeId: integer("envelope_id")
    .notNull()
    .references(() => envelopes.id),
  month: text("month").notNull(),
  assigned: real("assigned").notNull().default(0),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});

export const budgetTransfers = sqliteTable("budget_transfers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fromEnvelopeId: integer("from_envelope_id")
    .notNull()
    .references(() => envelopes.id),
  toEnvelopeId: integer("to_envelope_id")
    .notNull()
    .references(() => envelopes.id),
  month: text("month").notNull(),
  amount: real("amount").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`(CURRENT_TIMESTAMP)`),
});
```

> **Note:** Drizzle's `sqliteTable` builder does not support CHECK constraints or ON DELETE policies.
> These are enforced at the SQLite level via the migration SQL (which includes `CHECK(amount > 0)`,
> `CHECK(from_envelope_id != to_envelope_id)`, and `ON DELETE RESTRICT`). If the migration is ever
> regenerated via `drizzle-kit generate`, the CHECKs must be re-added manually.

- [ ] **Step 2: Verify types compile**

Run: `bun run check-types`
Expected: PASS (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/main/db/schema.ts
git commit -m "feat: add envelope budgeting table definitions to schema"
```

---

### Task 2: Write migration SQL

**Files:**

- Create: `src/main/db/migrations/0009_envelope_budgeting.sql`
- Modify: `src/main/db/migrations/meta/_journal.json:67` (add idx 9 entry)

- [ ] **Step 1: Create migration file**

Create `src/main/db/migrations/0009_envelope_budgeting.sql`:

```sql
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
```

- [ ] **Step 2: Add journal entry**

Add to `src/main/db/migrations/meta/_journal.json` entries array after idx 8:

```json
,
    {
      "idx": 9,
      "version": "6",
      "when": 1741996900000,
      "tag": "0009_envelope_budgeting",
      "breakpoints": true
    }
```

- [ ] **Step 3: Generate snapshot file**

Create `src/main/db/migrations/meta/0009_snapshot.json`. Copy `0008_snapshot.json` as a base, then add the 4 new table definitions to the `tables` object matching the migration SQL. The snapshot must reflect the full schema state after migration 0009.

- [ ] **Step 4: Test migration against fresh DB**

```bash
rm -f test.db
sed '/^--> statement-breakpoint/d' src/main/db/migrations/0009_envelope_budgeting.sql | sqlite3 test.db
sqlite3 test.db ".tables"
rm test.db
```

Expected output includes: `budget_allocations budget_transfers envelope_categories envelopes`

- [ ] **Step 5: Rebuild public/db.js**

```bash
bun run vite build --config vite.main.config.ts
```

Expected: Build succeeds

- [ ] **Step 6: Run existing tests to verify no regressions**

```bash
bun run test
```

Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add src/main/db/migrations/ public/db.js
git commit -m "feat: add 0009 envelope budgeting migration (4 tables, 7 indexes)"
```

---

## Chunk 2: IPC Handlers + Wiring

### Task 3: Envelope IPC handler

**Files:**

- Create: `public/ipc/envelopes.js`

- [ ] **Step 1: Create envelopes.js**

```js
const { eq } = require("drizzle-orm");

module.exports = function registerEnvelopesHandlers(ipcMain, db, schema) {
  ipcMain.handle("envelopes:getAll", () =>
    db
      .select()
      .from(schema.envelopes)
      .where(eq(schema.envelopes.active, true))
      .orderBy(schema.envelopes.sortOrder),
  );
  // Needed by useBudgetSummary for rollover/overspend across deactivated envelopes
  ipcMain.handle("envelopes:getAllIncludingInactive", () =>
    db.select().from(schema.envelopes),
  );
  ipcMain.handle("envelopes:getById", (_, id) =>
    db
      .select()
      .from(schema.envelopes)
      .where(eq(schema.envelopes.id, id))
      .then((r) => r[0] ?? null),
  );
  ipcMain.handle("envelopes:create", (_, data) =>
    db.insert(schema.envelopes).values(data).returning(),
  );
  ipcMain.handle("envelopes:update", (_, id, data) =>
    db
      .update(schema.envelopes)
      .set(data)
      .where(eq(schema.envelopes.id, id))
      .returning(),
  );
  ipcMain.handle("envelopes:delete", (_, id) =>
    db
      .update(schema.envelopes)
      .set({ active: false })
      .where(eq(schema.envelopes.id, id))
      .returning(),
  );
};
```

Note: `envelopes:delete` does a soft-delete (sets `active = false`), not a hard delete.

---

### Task 4: Envelope-categories IPC handler

**Files:**

- Create: `public/ipc/envelope-categories.js`

- [ ] **Step 1: Create envelope-categories.js**

```js
const { eq, and } = require("drizzle-orm");

module.exports = function registerEnvelopeCategoriesHandlers(
  ipcMain,
  db,
  schema,
) {
  ipcMain.handle("envelope_categories:getAll", () =>
    db.select().from(schema.envelopeCategories),
  );
  ipcMain.handle("envelope_categories:getByEnvelope", (_, envelopeId) =>
    db
      .select()
      .from(schema.envelopeCategories)
      .where(eq(schema.envelopeCategories.envelopeId, envelopeId)),
  );
  ipcMain.handle("envelope_categories:create", async (_, data) => {
    // Validate: only expense-type categories may be mapped
    const cat = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, data.categoryId))
      .then((r) => r[0] ?? null);
    if (!cat) throw new Error("Category not found");
    if (cat.expenseType !== "expense") {
      throw new Error(
        "Only expense-type categories can be mapped to envelopes",
      );
    }
    return db.insert(schema.envelopeCategories).values(data).returning();
  });
  ipcMain.handle("envelope_categories:delete", (_, id) =>
    db
      .delete(schema.envelopeCategories)
      .where(eq(schema.envelopeCategories.id, id)),
  );
  ipcMain.handle("envelope_categories:deleteByEnvelope", (_, envelopeId) =>
    db
      .delete(schema.envelopeCategories)
      .where(eq(schema.envelopeCategories.envelopeId, envelopeId)),
  );
};
```

---

### Task 5: Budget-allocations IPC handler

**Files:**

- Create: `public/ipc/budget-allocations.js`

- [ ] **Step 1: Create budget-allocations.js**

```js
const { eq, and } = require("drizzle-orm");

module.exports = function registerBudgetAllocationsHandlers(
  ipcMain,
  db,
  schema,
) {
  ipcMain.handle("budget_allocations:getAll", () =>
    db.select().from(schema.budgetAllocations),
  );
  ipcMain.handle("budget_allocations:getByMonth", (_, month) =>
    db
      .select()
      .from(schema.budgetAllocations)
      .where(eq(schema.budgetAllocations.month, month)),
  );
  ipcMain.handle(
    "budget_allocations:upsert",
    async (_, envelopeId, month, assigned) => {
      // Try update first, then insert if no row exists
      const existing = await db
        .select()
        .from(schema.budgetAllocations)
        .where(
          and(
            eq(schema.budgetAllocations.envelopeId, envelopeId),
            eq(schema.budgetAllocations.month, month),
          ),
        )
        .then((r) => r[0] ?? null);
      if (existing) {
        return db
          .update(schema.budgetAllocations)
          .set({ assigned })
          .where(eq(schema.budgetAllocations.id, existing.id))
          .returning();
      }
      return db
        .insert(schema.budgetAllocations)
        .values({ envelopeId, month, assigned })
        .returning();
    },
  );
  ipcMain.handle(
    "budget_allocations:quickFill",
    async (_, targetMonth, sourceMonth) => {
      // Get all allocations from source month
      const sourceRows = await db
        .select()
        .from(schema.budgetAllocations)
        .where(eq(schema.budgetAllocations.month, sourceMonth));
      if (sourceRows.length === 0) return [];

      // Get envelope IDs that already have a row for target month
      const existingRows = await db
        .select()
        .from(schema.budgetAllocations)
        .where(eq(schema.budgetAllocations.month, targetMonth));
      const existingEnvelopeIds = new Set(
        existingRows.map((r) => r.envelopeId),
      );

      // Get active envelope IDs
      const activeEnvelopes = await db
        .select()
        .from(schema.envelopes)
        .where(eq(schema.envelopes.active, true));
      const activeIds = new Set(activeEnvelopes.map((e) => e.id));

      // Only fill envelopes that are active AND have no row for target month
      const toInsert = sourceRows
        .filter(
          (r) =>
            activeIds.has(r.envelopeId) &&
            !existingEnvelopeIds.has(r.envelopeId),
        )
        .map((r) => ({
          envelopeId: r.envelopeId,
          month: targetMonth,
          assigned: r.assigned,
        }));

      if (toInsert.length === 0) return [];
      return db.insert(schema.budgetAllocations).values(toInsert).returning();
    },
  );
  ipcMain.handle("budget_allocations:delete", (_, id) =>
    db
      .delete(schema.budgetAllocations)
      .where(eq(schema.budgetAllocations.id, id)),
  );
};
```

---

### Task 6: Budget-transfers IPC handler

**Files:**

- Create: `public/ipc/budget-transfers.js`

- [ ] **Step 1: Create budget-transfers.js**

```js
const { eq } = require("drizzle-orm");

module.exports = function registerBudgetTransfersHandlers(ipcMain, db, schema) {
  ipcMain.handle("budget_transfers:getAll", () =>
    db.select().from(schema.budgetTransfers),
  );
  ipcMain.handle("budget_transfers:getByMonth", (_, month) =>
    db
      .select()
      .from(schema.budgetTransfers)
      .where(eq(schema.budgetTransfers.month, month)),
  );
  ipcMain.handle("budget_transfers:create", (_, data) =>
    db.insert(schema.budgetTransfers).values(data).returning(),
  );
  ipcMain.handle("budget_transfers:delete", (_, id) =>
    db.delete(schema.budgetTransfers).where(eq(schema.budgetTransfers.id, id)),
  );
};
```

---

### Task 7: Wire IPC into electron.js, preload.js, electron.d.ts

**Files:**

- Modify: `public/electron.js:14` (add imports), `public/electron.js:88` (register handlers)
- Modify: `public/preload.js:84` (add API methods)
- Modify: `src/types/electron.d.ts` (add types + interface methods)

- [ ] **Step 1: Add imports to electron.js**

After line 14 (`const registerImportHandlers = require("./ipc/import");`), add:

```js
const registerEnvelopesHandlers = require("./ipc/envelopes");
const registerEnvelopeCategoriesHandlers = require("./ipc/envelope-categories");
const registerBudgetAllocationsHandlers = require("./ipc/budget-allocations");
const registerBudgetTransfersHandlers = require("./ipc/budget-transfers");
```

- [ ] **Step 2: Register handlers in electron.js**

After line 88 (`registerImportHandlers(ipcMain, dialog);`), add:

```js
registerEnvelopesHandlers(ipcMain, db, schema);
registerEnvelopeCategoriesHandlers(ipcMain, db, schema);
registerBudgetAllocationsHandlers(ipcMain, db, schema);
registerBudgetTransfersHandlers(ipcMain, db, schema);
```

- [ ] **Step 3: Add API methods to preload.js**

After line 84 (end of payees section, before closing `};`), add:

```js
  // Envelopes
  getEnvelopes: () => ipcRenderer.invoke("envelopes:getAll"),
  getAllEnvelopesIncludingInactive: () =>
    ipcRenderer.invoke("envelopes:getAllIncludingInactive"),
  getEnvelope: (id) => ipcRenderer.invoke("envelopes:getById", id),
  createEnvelope: (data) => ipcRenderer.invoke("envelopes:create", data),
  updateEnvelope: (id, data) => ipcRenderer.invoke("envelopes:update", id, data),
  deleteEnvelope: (id) => ipcRenderer.invoke("envelopes:delete", id),

  // Envelope-category mappings
  getEnvelopeCategories: () => ipcRenderer.invoke("envelope_categories:getAll"),
  getEnvelopeCategoriesByEnvelope: (envelopeId) =>
    ipcRenderer.invoke("envelope_categories:getByEnvelope", envelopeId),
  createEnvelopeCategory: (data) =>
    ipcRenderer.invoke("envelope_categories:create", data),
  deleteEnvelopeCategory: (id) =>
    ipcRenderer.invoke("envelope_categories:delete", id),
  deleteEnvelopeCategoriesByEnvelope: (envelopeId) =>
    ipcRenderer.invoke("envelope_categories:deleteByEnvelope", envelopeId),

  // Budget allocations
  getBudgetAllocations: () => ipcRenderer.invoke("budget_allocations:getAll"),
  getBudgetAllocationsByMonth: (month) =>
    ipcRenderer.invoke("budget_allocations:getByMonth", month),
  upsertBudgetAllocation: (envelopeId, month, assigned) =>
    ipcRenderer.invoke("budget_allocations:upsert", envelopeId, month, assigned),
  quickFillAllocations: (targetMonth, sourceMonth) =>
    ipcRenderer.invoke("budget_allocations:quickFill", targetMonth, sourceMonth),
  deleteBudgetAllocation: (id) =>
    ipcRenderer.invoke("budget_allocations:delete", id),

  // Budget transfers
  getBudgetTransfers: () => ipcRenderer.invoke("budget_transfers:getAll"),
  getBudgetTransfersByMonth: (month) =>
    ipcRenderer.invoke("budget_transfers:getByMonth", month),
  createBudgetTransfer: (data) =>
    ipcRenderer.invoke("budget_transfers:create", data),
  deleteBudgetTransfer: (id) =>
    ipcRenderer.invoke("budget_transfers:delete", id),
```

- [ ] **Step 4: Add types to electron.d.ts**

Add to import (line 1-9):

```ts
import type {
  accountReconciliations,
  accounts,
  budgetAllocations,
  budgetTransfers,
  categories,
  envelopeCategories,
  envelopes,
  payees,
  scheduledTransactions,
  settings,
  transactions,
} from "@/main/db/schema";
```

Add type exports after line 28 (`export type Payee = ...`):

```ts
export type Envelope = InferSelectModel<typeof envelopes>;
export type EnvelopeCategory = InferSelectModel<typeof envelopeCategories>;
export type BudgetAllocation = InferSelectModel<typeof budgetAllocations>;
export type BudgetTransfer = InferSelectModel<typeof budgetTransfers>;
```

Add interface methods after the payees section (before closing `}` of `ElectronAPI`):

```ts
// Envelopes
getEnvelopes: () => Promise<Envelope[]>;
getAllEnvelopesIncludingInactive: () => Promise<Envelope[]>;
getEnvelope: (id: number) => Promise<Envelope | null>;
createEnvelope: (data: Omit<Envelope, "id" | "createdAt">) =>
  Promise<Envelope[]>;
updateEnvelope: (
  id: number,
  data: Partial<Omit<Envelope, "id" | "createdAt">>,
) => Promise<Envelope[]>;
deleteEnvelope: (id: number) => Promise<Envelope[]>;

// Envelope-category mappings
getEnvelopeCategories: () => Promise<EnvelopeCategory[]>;
getEnvelopeCategoriesByEnvelope: (envelopeId: number) =>
  Promise<EnvelopeCategory[]>;
createEnvelopeCategory: (data: Omit<EnvelopeCategory, "id">) =>
  Promise<EnvelopeCategory[]>;
deleteEnvelopeCategory: (id: number) => Promise<void>;
deleteEnvelopeCategoriesByEnvelope: (envelopeId: number) => Promise<void>;

// Budget allocations
getBudgetAllocations: () => Promise<BudgetAllocation[]>;
getBudgetAllocationsByMonth: (month: string) => Promise<BudgetAllocation[]>;
upsertBudgetAllocation: (envelopeId: number, month: string, assigned: number) =>
  Promise<BudgetAllocation[]>;
quickFillAllocations: (targetMonth: string, sourceMonth: string) =>
  Promise<BudgetAllocation[]>;
deleteBudgetAllocation: (id: number) => Promise<void>;

// Budget transfers
getBudgetTransfers: () => Promise<BudgetTransfer[]>;
getBudgetTransfersByMonth: (month: string) => Promise<BudgetTransfer[]>;
createBudgetTransfer: (data: Omit<BudgetTransfer, "id" | "createdAt">) =>
  Promise<BudgetTransfer[]>;
deleteBudgetTransfer: (id: number) => Promise<void>;
```

- [ ] **Step 5: Verify types compile**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 6: Lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add public/ipc/envelopes.js public/ipc/envelope-categories.js public/ipc/budget-allocations.js public/ipc/budget-transfers.js public/electron.js public/preload.js src/types/electron.d.ts
git commit -m "feat: add IPC handlers + wiring for envelope budgeting (4 entities)"
```

---

## Chunk 3: Integration Tests

### Task 8: Add test fixtures + register handlers

**Files:**

- Modify: `src/tests/integration/helpers/fixtures.ts:274` (append envelope fixtures)
- Modify: `src/tests/integration/helpers/ipc.ts:41` (register new handlers)

- [ ] **Step 1: Add envelope fixtures to fixtures.ts**

Append after line 274:

```ts
// ─── Envelope fixtures ────────────────────────────────────────────────────────

export const ENVELOPE_GROCERIES = {
  name: "Groceries",
};

export const ENVELOPE_BILLS = {
  name: "Bills",
};
```

- [ ] **Step 2: Register new handlers in ipc.ts**

After line 41 (`require("../../../../public/ipc/account-reconciliations.js")(ipcMain, db, schema);`), add:

```ts
require("../../../../public/ipc/envelopes.js")(ipcMain, db, schema);
require("../../../../public/ipc/envelope-categories.js")(ipcMain, db, schema);
require("../../../../public/ipc/budget-allocations.js")(ipcMain, db, schema);
require("../../../../public/ipc/budget-transfers.js")(ipcMain, db, schema);
```

- [ ] **Step 3: Commit**

```bash
git add src/tests/integration/helpers/fixtures.ts src/tests/integration/helpers/ipc.ts
git commit -m "test: add envelope fixtures + register budget IPC handlers in test helpers"
```

---

### Task 9: Envelope + mapping integration tests

**Files:**

- Create: `src/tests/integration/envelopes.test.ts`

- [ ] **Step 1: Write envelopes.test.ts**

```ts
import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import { ENVELOPE_GROCERIES, ENVELOPE_BILLS } from "./helpers/fixtures";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

describe("envelopes IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  // ── Envelope CRUD ──────────────────────────────────────────────────────────

  let groceriesId: number;
  let billsId: number;

  it("create envelope", async () => {
    const rows = await invoke<{ id: number; name: string; active: boolean }[]>(
      "envelopes:create",
      ENVELOPE_GROCERIES,
    );
    groceriesId = rows[0].id;
    expect(rows[0].name).toBe("Groceries");
    expect(rows[0].active).toBe(true);
  });

  it("create second envelope", async () => {
    const rows = await invoke<{ id: number }[]>(
      "envelopes:create",
      ENVELOPE_BILLS,
    );
    billsId = rows[0].id;
  });

  it("getAll returns only active envelopes", async () => {
    const all = await invoke<{ id: number }[]>("envelopes:getAll");
    expect(all.length).toBe(2);
  });

  it("getById returns single envelope", async () => {
    const found = await invoke<{ name: string } | null>(
      "envelopes:getById",
      groceriesId,
    );
    expect(found?.name).toBe("Groceries");
  });

  it("update envelope name", async () => {
    await invoke("envelopes:update", groceriesId, { name: "Food" });
    const found = await invoke<{ name: string } | null>(
      "envelopes:getById",
      groceriesId,
    );
    expect(found?.name).toBe("Food");
  });

  it("soft-delete envelope — getAll excludes it", async () => {
    await invoke("envelopes:delete", billsId);
    const all = await invoke<{ id: number }[]>("envelopes:getAll");
    expect(all.length).toBe(1);
    // getById still returns it (with active=false)
    const found = await invoke<{ active: boolean } | null>(
      "envelopes:getById",
      billsId,
    );
    expect(found?.active).toBe(false);
  });

  // ── Envelope-category mappings ─────────────────────────────────────────────

  let mappingId: number;

  it("map expense category to envelope", async () => {
    // Find seeded "Groceries" category (expense type)
    const cats =
      await invoke<{ id: number; name: string; expenseType: string }[]>(
        "categories:getAll",
      );
    const groceriesCat = cats.find((c) => c.name === "Groceries");
    expect(groceriesCat).toBeDefined();

    const rows = await invoke<{ id: number }[]>("envelope_categories:create", {
      envelopeId: groceriesId,
      categoryId: groceriesCat!.id,
    });
    mappingId = rows[0].id;
    expect(rows.length).toBe(1);
  });

  it("reject mapping same category to two envelopes (UNIQUE constraint)", async () => {
    // Re-create the mapping we deleted
    const cats =
      await invoke<{ id: number; name: string }[]>("categories:getAll");
    const groceriesCat = cats.find((c) => c.name === "Groceries")!;

    // Re-create billsId as active for this test
    const billsRows = await invoke<{ id: number }[]>("envelopes:create", {
      name: "Bills2",
    });
    const bills2Id = billsRows[0].id;

    // Map Groceries to Food envelope
    await invoke("envelope_categories:create", {
      envelopeId: groceriesId,
      categoryId: groceriesCat.id,
    });

    // Attempt to map same category to Bills2 — should fail
    await expect(
      invoke("envelope_categories:create", {
        envelopeId: bills2Id,
        categoryId: groceriesCat.id,
      }),
    ).rejects.toThrow();

    // Cleanup: remove mapping for subsequent tests
    const mappings = await invoke<{ id: number }[]>(
      "envelope_categories:getByEnvelope",
      groceriesId,
    );
    if (mappings.length > 0)
      await invoke("envelope_categories:delete", mappings[0].id);
  });

  it("reject mapping transfer category to envelope", async () => {
    const cats =
      await invoke<{ id: number; name: string; expenseType: string }[]>(
        "categories:getAll",
      );
    // Find a transfer-type category if one exists, or create one
    let transferCat = cats.find((c) => c.expenseType === "transfer");
    if (!transferCat) {
      const rows = await invoke<{ id: number; expenseType: string }[]>(
        "categories:create",
        { name: "Test Transfer", expenseType: "transfer" },
      );
      transferCat = { ...rows[0], name: "Test Transfer" };
    }

    await expect(
      invoke("envelope_categories:create", {
        envelopeId: groceriesId,
        categoryId: transferCat.id,
      }),
    ).rejects.toThrow("Only expense-type categories");
  });

  it("reject mapping income category to envelope", async () => {
    const cats =
      await invoke<{ id: number; name: string; expenseType: string }[]>(
        "categories:getAll",
      );
    const salary = cats.find((c) => c.name === "Salary");
    expect(salary).toBeDefined();

    await expect(
      invoke("envelope_categories:create", {
        envelopeId: groceriesId,
        categoryId: salary!.id,
      }),
    ).rejects.toThrow("Only expense-type categories");
  });

  it("getByEnvelope returns mappings", async () => {
    const rows = await invoke<{ id: number }[]>(
      "envelope_categories:getByEnvelope",
      groceriesId,
    );
    expect(rows.length).toBe(1);
  });

  it("delete mapping", async () => {
    await invoke("envelope_categories:delete", mappingId);
    const rows = await invoke<{ id: number }[]>(
      "envelope_categories:getByEnvelope",
      groceriesId,
    );
    expect(rows.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun run test src/tests/integration/envelopes.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/tests/integration/envelopes.test.ts
git commit -m "test: add envelope + mapping integration tests"
```

---

### Task 10: Budget allocation integration tests

**Files:**

- Create: `src/tests/integration/budget-allocations.test.ts`

- [ ] **Step 1: Write budget-allocations.test.ts**

```ts
import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

describe("budget allocations IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  let envelopeA: number;
  let envelopeB: number;

  it("setup: create two envelopes", async () => {
    const a = await invoke<{ id: number }[]>("envelopes:create", {
      name: "Food",
    });
    const b = await invoke<{ id: number }[]>("envelopes:create", {
      name: "Bills",
    });
    envelopeA = a[0].id;
    envelopeB = b[0].id;
  });

  // ── Upsert ─────────────────────────────────────────────────────────────────

  it("upsert creates allocation when none exists", async () => {
    const rows = await invoke<{ id: number; assigned: number }[]>(
      "budget_allocations:upsert",
      envelopeA,
      "2026-03",
      300,
    );
    expect(rows[0].assigned).toBe(300);
  });

  it("upsert updates allocation when row exists", async () => {
    const rows = await invoke<{ assigned: number }[]>(
      "budget_allocations:upsert",
      envelopeA,
      "2026-03",
      350,
    );
    expect(rows[0].assigned).toBe(350);
  });

  it("getByMonth returns allocations for the month", async () => {
    await invoke("budget_allocations:upsert", envelopeB, "2026-03", 500);
    const rows = await invoke<{ envelopeId: number }[]>(
      "budget_allocations:getByMonth",
      "2026-03",
    );
    expect(rows.length).toBe(2);
  });

  // ── Quick Fill ─────────────────────────────────────────────────────────────

  it("quickFill copies from source month to target month", async () => {
    const rows = await invoke<{ envelopeId: number; assigned: number }[]>(
      "budget_allocations:quickFill",
      "2026-04",
      "2026-03",
    );
    expect(rows.length).toBe(2);
    const food = rows.find((r) => r.envelopeId === envelopeA);
    expect(food?.assigned).toBe(350);
  });

  it("quickFill does not overwrite existing allocations", async () => {
    // Set envelopeA for May to 0 (intentional zero)
    await invoke("budget_allocations:upsert", envelopeA, "2026-05", 0);

    // Quick fill from March to May — should only create envelopeB
    const rows = await invoke<{ envelopeId: number }[]>(
      "budget_allocations:quickFill",
      "2026-05",
      "2026-03",
    );
    expect(rows.length).toBe(1);
    expect(rows[0].envelopeId).toBe(envelopeB);

    // Verify envelopeA still has assigned=0
    const may = await invoke<{ envelopeId: number; assigned: number }[]>(
      "budget_allocations:getByMonth",
      "2026-05",
    );
    const foodMay = may.find((r) => r.envelopeId === envelopeA);
    expect(foodMay?.assigned).toBe(0);
  });

  it("quickFill skips inactive envelopes", async () => {
    // Soft-delete envelopeB
    await invoke("envelopes:delete", envelopeB);

    const rows = await invoke<{ envelopeId: number }[]>(
      "budget_allocations:quickFill",
      "2026-06",
      "2026-03",
    );
    // Only envelopeA should be filled (envelopeB is inactive)
    expect(rows.length).toBe(1);
    expect(rows[0].envelopeId).toBe(envelopeA);
  });

  it("quickFill returns empty when source month has no allocations", async () => {
    const rows = await invoke<unknown[]>(
      "budget_allocations:quickFill",
      "2026-07",
      "2026-12",
    );
    expect(rows.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test**

Run: `bun run test src/tests/integration/budget-allocations.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/tests/integration/budget-allocations.test.ts
git commit -m "test: add budget allocation integration tests (upsert + quick-fill)"
```

---

### Task 11: Budget transfer integration tests

**Files:**

- Create: `src/tests/integration/budget-transfers.test.ts`

- [ ] **Step 1: Write budget-transfers.test.ts**

```ts
import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "./helpers/db";
import { createMockIpc, registerAllHandlers } from "./helpers/ipc";

describe("budget transfers IPC", () => {
  const { db, schema, teardown } = createTestDb();
  const { ipcMain, invoke } = createMockIpc();
  registerAllHandlers(ipcMain, db, schema);

  afterAll(() => teardown());

  let envelopeA: number;
  let envelopeB: number;

  it("setup: create two envelopes", async () => {
    const a = await invoke<{ id: number }[]>("envelopes:create", {
      name: "Food",
    });
    const b = await invoke<{ id: number }[]>("envelopes:create", {
      name: "Bills",
    });
    envelopeA = a[0].id;
    envelopeB = b[0].id;
  });

  it("create transfer between envelopes", async () => {
    const rows = await invoke<{ id: number; amount: number }[]>(
      "budget_transfers:create",
      {
        fromEnvelopeId: envelopeA,
        toEnvelopeId: envelopeB,
        month: "2026-03",
        amount: 50,
      },
    );
    expect(rows[0].amount).toBe(50);
  });

  it("getByMonth returns transfers for the month", async () => {
    const rows = await invoke<{ id: number }[]>(
      "budget_transfers:getByMonth",
      "2026-03",
    );
    expect(rows.length).toBe(1);
  });

  it("reject self-transfer (CHECK constraint)", async () => {
    await expect(
      invoke("budget_transfers:create", {
        fromEnvelopeId: envelopeA,
        toEnvelopeId: envelopeA,
        month: "2026-03",
        amount: 50,
      }),
    ).rejects.toThrow();
  });

  it("reject zero or negative amount (CHECK constraint)", async () => {
    await expect(
      invoke("budget_transfers:create", {
        fromEnvelopeId: envelopeA,
        toEnvelopeId: envelopeB,
        month: "2026-03",
        amount: 0,
      }),
    ).rejects.toThrow();

    await expect(
      invoke("budget_transfers:create", {
        fromEnvelopeId: envelopeA,
        toEnvelopeId: envelopeB,
        month: "2026-03",
        amount: -10,
      }),
    ).rejects.toThrow();
  });

  it("delete transfer", async () => {
    const all = await invoke<{ id: number }[]>(
      "budget_transfers:getByMonth",
      "2026-03",
    );
    await invoke("budget_transfers:delete", all[0].id);
    const after = await invoke<{ id: number }[]>(
      "budget_transfers:getByMonth",
      "2026-03",
    );
    expect(after.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test**

Run: `bun run test src/tests/integration/budget-transfers.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Run all tests to verify no regressions**

Run: `bun run test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/tests/integration/budget-transfers.test.ts
git commit -m "test: add budget transfer integration tests (CRUD + CHECK constraints)"
```

---

## Chunk 4: Frontend Hooks + Computation

### Task 12: CRUD hooks (envelopes, mappings, allocations, transfers)

**Files:**

- Create: `src/hooks/useEnvelopes.ts`
- Create: `src/hooks/useEnvelopeCategories.ts`
- Create: `src/hooks/useBudgetAllocations.ts`
- Create: `src/hooks/useBudgetTransfers.ts`

- [ ] **Step 1: Create useEnvelopes.ts**

```ts
import type { Envelope } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useEnvelopes() {
  const qc = useQueryClient();

  const { data: envelopes = [] } = useQuery({
    queryKey: ["envelopes"],
    queryFn: () => window.api.getEnvelopes(),
  });

  const create = useMutation({
    mutationFn: (data: Omit<Envelope, "id" | "createdAt">) =>
      window.api.createEnvelope(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopes"] }),
  });

  const update = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<Omit<Envelope, "id" | "createdAt">>;
    }) => window.api.updateEnvelope(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopes"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteEnvelope(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopes"] }),
  });

  return { envelopes, create, update, remove };
}
```

- [ ] **Step 2: Create useEnvelopeCategories.ts**

```ts
import type { EnvelopeCategory } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useEnvelopeCategories() {
  const qc = useQueryClient();

  const { data: mappings = [] } = useQuery({
    queryKey: ["envelopeCategories"],
    queryFn: () => window.api.getEnvelopeCategories(),
  });

  const create = useMutation({
    mutationFn: (data: Omit<EnvelopeCategory, "id">) =>
      window.api.createEnvelopeCategory(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopeCategories"] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => window.api.deleteEnvelopeCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopeCategories"] }),
  });

  const removeByEnvelope = useMutation({
    mutationFn: (envelopeId: number) =>
      window.api.deleteEnvelopeCategoriesByEnvelope(envelopeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["envelopeCategories"] }),
  });

  return { mappings, create, remove, removeByEnvelope };
}
```

- [ ] **Step 3: Create useBudgetAllocations.ts**

```ts
import type { BudgetAllocation } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useBudgetAllocations(month: string) {
  const qc = useQueryClient();

  const { data: allocations = [] } = useQuery({
    queryKey: ["budgetAllocations", month],
    queryFn: () => window.api.getBudgetAllocationsByMonth(month),
  });

  const invalidateAllocations = () =>
    qc.invalidateQueries({ queryKey: ["budgetAllocations"] });

  const upsert = useMutation({
    mutationFn: ({
      envelopeId,
      assigned,
    }: {
      envelopeId: number;
      assigned: number;
    }) => window.api.upsertBudgetAllocation(envelopeId, month, assigned),
    onSuccess: invalidateAllocations,
  });

  const quickFill = useMutation({
    mutationFn: (sourceMonth: string) =>
      window.api.quickFillAllocations(month, sourceMonth),
    onSuccess: invalidateAllocations,
  });

  return { allocations, upsert, quickFill };
}
```

- [ ] **Step 4: Create useBudgetTransfers.ts**

```ts
import type { BudgetTransfer } from "@/types/electron";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useBudgetTransfers(month: string) {
  const qc = useQueryClient();

  const { data: transfers = [] } = useQuery({
    queryKey: ["budgetTransfers", month],
    queryFn: () => window.api.getBudgetTransfersByMonth(month),
  });

  const create = useMutation({
    mutationFn: (data: Omit<BudgetTransfer, "id" | "createdAt">) =>
      window.api.createBudgetTransfer(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["budgetTransfers"] }),
  });

  return { transfers, create };
}
```

- [ ] **Step 5: Verify types**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useEnvelopes.ts src/hooks/useEnvelopeCategories.ts src/hooks/useBudgetAllocations.ts src/hooks/useBudgetTransfers.ts
git commit -m "feat: add TanStack Query hooks for envelope budgeting (4 hooks)"
```

---

### Task 13: Budget summary computation hook

This is the core computation hook. It calculates ATB, activity, available, rollover, and underfunded warnings. All computation is client-side from data already fetched.

**Files:**

- Create: `src/hooks/useBudgetSummary.ts`

- [ ] **Step 1: Create useBudgetSummary.ts**

```ts
import type {
  BudgetAllocation,
  BudgetTransfer,
  Category,
  Envelope,
  EnvelopeCategory,
  ScheduledTransaction,
  Transaction,
} from "@/types/electron";
import { useQuery } from "@tanstack/react-query";

type EnvelopeSummary = {
  envelopeId: number;
  name: string;
  assigned: number;
  activity: number;
  transfersIn: number;
  transfersOut: number;
  rolledOver: number;
  available: number;
  underfunded: boolean;
  categoryIds: number[];
};

type BudgetSummary = {
  availableToBudget: number;
  totalIncome: number;
  totalAssigned: number;
  overspendFromPrior: number;
  envelopes: EnvelopeSummary[];
  unbudgetedActivity: number;
  unbudgetedCategories: { categoryId: number; name: string; amount: number }[];
};

/** Get YYYY-MM from a date string */
function toMonth(date: string): string {
  return date.slice(0, 7);
}

/** Get the previous month in YYYY-MM format */
function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // month is 0-indexed, so m-2
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Compute the rolled-over balance for an envelope from its start month
 * up to (but not including) the target month.
 */
function computeRollover(
  envelopeId: number,
  targetMonth: string,
  startMonth: string,
  allAllocations: BudgetAllocation[],
  allTransfers: BudgetTransfer[],
  transactions: Transaction[],
  categoryIds: number[],
): number {
  let rolledOver = 0;
  let current = startMonth;

  while (current < targetMonth) {
    const alloc = allAllocations.find(
      (a) => a.envelopeId === envelopeId && a.month === current,
    );
    const assigned = alloc?.assigned ?? 0;

    const activity = transactions
      .filter(
        (t) =>
          t.categoryId &&
          categoryIds.includes(t.categoryId) &&
          toMonth(t.date) === current,
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const tIn = allTransfers
      .filter((t) => t.toEnvelopeId === envelopeId && t.month === current)
      .reduce((sum, t) => sum + t.amount, 0);
    const tOut = allTransfers
      .filter((t) => t.fromEnvelopeId === envelopeId && t.month === current)
      .reduce((sum, t) => sum + t.amount, 0);

    const available = rolledOver + assigned + activity + tIn - tOut;
    // Positive rolls forward; negative resets to 0 (overspend absorbed by ATB)
    rolledOver = Math.max(0, available);

    // Advance to next month
    current = nextMonth(current);
  }

  return rolledOver;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1); // m is already 1-indexed, so this is next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Compute total overspend across all envelopes for a given month.
 * Overspend = negative available at end of month (clamped to 0 minimum contribution).
 */
function computeOverspendForMonth(
  envelopes: Envelope[],
  month: string,
  allAllocations: BudgetAllocation[],
  allTransfers: BudgetTransfer[],
  transactions: Transaction[],
  mappings: EnvelopeCategory[],
): number {
  let totalOverspend = 0;

  for (const env of envelopes) {
    const categoryIds = mappings
      .filter((m) => m.envelopeId === env.id)
      .map((m) => m.categoryId);

    const startMonth = toMonth(env.createdAt ?? month);
    const rolledOver = computeRollover(
      env.id,
      month,
      startMonth,
      allAllocations,
      allTransfers,
      transactions,
      categoryIds,
    );

    const alloc = allAllocations.find(
      (a) => a.envelopeId === env.id && a.month === month,
    );
    const assigned = alloc?.assigned ?? 0;

    const activity = transactions
      .filter(
        (t) =>
          t.categoryId &&
          categoryIds.includes(t.categoryId) &&
          toMonth(t.date) === month,
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const tIn = allTransfers
      .filter((t) => t.toEnvelopeId === env.id && t.month === month)
      .reduce((sum, t) => sum + t.amount, 0);
    const tOut = allTransfers
      .filter((t) => t.fromEnvelopeId === env.id && t.month === month)
      .reduce((sum, t) => sum + t.amount, 0);

    const available = rolledOver + assigned + activity + tIn - tOut;
    if (available < 0) {
      totalOverspend += Math.abs(available);
    }
  }

  return totalOverspend;
}

export function useBudgetSummary(month: string) {
  // Use ALL envelopes (including inactive) for rollover/overspend calculations
  const { data: allEnvelopes = [] } = useQuery<Envelope[]>({
    queryKey: ["envelopes", "all"],
    queryFn: () => window.api.getAllEnvelopesIncludingInactive(),
  });
  const envelopes = allEnvelopes.filter((e) => e.active);

  const { data: mappings = [] } = useQuery<EnvelopeCategory[]>({
    queryKey: ["envelopeCategories"],
    queryFn: () => window.api.getEnvelopeCategories(),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["categories"],
    queryFn: () => window.api.getCategories(),
  });

  const { data: allAllocations = [] } = useQuery<BudgetAllocation[]>({
    queryKey: ["budgetAllocations", "all"],
    queryFn: () => window.api.getBudgetAllocations(),
  });

  const { data: allTransfers = [] } = useQuery<BudgetTransfer[]>({
    queryKey: ["budgetTransfers", "all"],
    queryFn: () => window.api.getBudgetTransfers(),
  });

  const { data: allTransactions = [] } = useQuery<Transaction[]>({
    queryKey: ["transactions"],
    queryFn: () => window.api.getTransactions(),
  });

  const { data: scheduledTransactions = [] } = useQuery<ScheduledTransaction[]>(
    {
      queryKey: ["scheduledTransactions"],
      queryFn: () => window.api.getScheduledTransactions(),
    },
  );

  // Build category lookup
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const mappedCategoryIds = new Set(mappings.map((m) => m.categoryId));

  // Income for this month
  const incomeCategories = new Set(
    categories.filter((c) => c.expenseType === "income").map((c) => c.id),
  );
  const totalIncome = allTransactions
    .filter(
      (t) =>
        t.categoryId &&
        incomeCategories.has(t.categoryId) &&
        toMonth(t.date) === month,
    )
    .reduce((sum, t) => sum + t.amount, 0);

  // Total assigned this month
  const monthAllocations = allAllocations.filter((a) => a.month === month);
  const totalAssigned = monthAllocations.reduce(
    (sum, a) => sum + a.assigned,
    0,
  );

  // Overspend from prior month — uses ALL envelopes (including inactive)
  // because a deactivated envelope's historical overspend still affects ATB
  const prior = prevMonth(month);
  const overspendFromPrior = computeOverspendForMonth(
    allEnvelopes,
    prior,
    allAllocations,
    allTransfers,
    allTransactions,
    mappings,
  );

  // ATB
  const availableToBudget = totalIncome - totalAssigned - overspendFromPrior;

  // Per-envelope summaries
  const envelopeSummaries: EnvelopeSummary[] = envelopes.map((env) => {
    const categoryIds = mappings
      .filter((m) => m.envelopeId === env.id)
      .map((m) => m.categoryId);

    const startMonth = toMonth(env.createdAt ?? month);
    const rolledOver = computeRollover(
      env.id,
      month,
      startMonth,
      allAllocations,
      allTransfers,
      allTransactions,
      categoryIds,
    );

    const alloc = monthAllocations.find((a) => a.envelopeId === env.id);
    const assigned = alloc?.assigned ?? 0;

    const activity = allTransactions
      .filter(
        (t) =>
          t.categoryId &&
          categoryIds.includes(t.categoryId) &&
          toMonth(t.date) === month,
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const transfersIn = allTransfers
      .filter((t) => t.toEnvelopeId === env.id && t.month === month)
      .reduce((sum, t) => sum + t.amount, 0);
    const transfersOut = allTransfers
      .filter((t) => t.fromEnvelopeId === env.id && t.month === month)
      .reduce((sum, t) => sum + t.amount, 0);

    const available =
      rolledOver + assigned + activity + transfersIn - transfersOut;

    // Underfunded: check scheduled transactions for mapped categories
    const scheduledTotal = scheduledTransactions
      .filter(
        (s) =>
          s.active &&
          s.categoryId &&
          categoryIds.includes(s.categoryId) &&
          s.nextDueDate &&
          toMonth(s.nextDueDate) === month,
      )
      .reduce((sum, s) => sum + Math.abs(s.amount), 0);
    const underfunded = assigned < scheduledTotal;

    return {
      envelopeId: env.id,
      name: env.name,
      assigned,
      activity,
      transfersIn,
      transfersOut,
      rolledOver,
      available,
      underfunded,
      categoryIds,
    };
  });

  // Unbudgeted spending
  const expenseCategories = new Set(
    categories.filter((c) => c.expenseType === "expense").map((c) => c.id),
  );
  const unbudgetedTxns = allTransactions.filter(
    (t) =>
      t.categoryId &&
      expenseCategories.has(t.categoryId) &&
      !mappedCategoryIds.has(t.categoryId) &&
      toMonth(t.date) === month,
  );
  const unbudgetedActivity = unbudgetedTxns.reduce(
    (sum, t) => sum + t.amount,
    0,
  );

  // Group unbudgeted by category
  const unbudgetedByCategory = new Map<number, number>();
  for (const t of unbudgetedTxns) {
    const prev = unbudgetedByCategory.get(t.categoryId!) ?? 0;
    unbudgetedByCategory.set(t.categoryId!, prev + t.amount);
  }
  const unbudgetedCategories = Array.from(unbudgetedByCategory.entries()).map(
    ([categoryId, amount]) => ({
      categoryId,
      name: categoryMap.get(categoryId)?.name ?? "Unknown",
      amount,
    }),
  );

  const summary: BudgetSummary = {
    availableToBudget,
    totalIncome,
    totalAssigned,
    overspendFromPrior,
    envelopes: envelopeSummaries,
    unbudgetedActivity,
    unbudgetedCategories,
  };

  return summary;
}
```

- [ ] **Step 2: Verify types**

Run: `bun run check-types`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBudgetSummary.ts
git commit -m "feat: add useBudgetSummary hook (ATB, activity, rollover, underfunded)"
```

---

### Task 14: Unit tests for budget summary computation

Extract the pure computation functions from `useBudgetSummary.ts` into a separate file for unit testing, or test the logic via carefully constructed mock data.

**Files:**

- Create: `src/tests/unit/budget-summary.unit.test.ts`

- [ ] **Step 1: Extract pure functions**

Refactor `src/hooks/useBudgetSummary.ts` — move `toMonth`, `prevMonth`, `nextMonth`, `computeRollover`, and `computeOverspendForMonth` to a new file `src/hooks/budget-computations.ts` and export them. The hook imports them.

- [ ] **Step 2: Write unit tests**

```ts
import { describe, expect, it } from "vitest";
import {
  computeRollover,
  computeOverspendForMonth,
  toMonth,
  prevMonth,
  nextMonth,
} from "@/hooks/budget-computations";

describe("budget computations", () => {
  describe("toMonth", () => {
    it("extracts YYYY-MM from date string", () => {
      expect(toMonth("2026-03-15")).toBe("2026-03");
    });
  });

  describe("prevMonth / nextMonth", () => {
    it("handles mid-year", () => {
      expect(prevMonth("2026-03")).toBe("2026-02");
      expect(nextMonth("2026-03")).toBe("2026-04");
    });
    it("handles year boundary", () => {
      expect(prevMonth("2026-01")).toBe("2025-12");
      expect(nextMonth("2025-12")).toBe("2026-01");
    });
  });

  describe("computeRollover", () => {
    it("returns 0 when target is the start month", () => {
      const result = computeRollover(1, "2026-03", "2026-03", [], [], [], []);
      expect(result).toBe(0);
    });

    it("rolls positive balance forward", () => {
      // Envelope 1 had £300 assigned and £200 spent in Feb
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 300,
          createdAt: null,
        },
      ];
      const transactions = [
        {
          id: 1,
          accountId: 1,
          categoryId: 10,
          date: "2026-02-15",
          payee: "Shop",
          amount: -200,
          notes: null,
          cleared: true,
          reconciled: false,
          transferTransactionId: null,
          createdAt: null,
        },
      ];
      const result = computeRollover(
        1,
        "2026-03",
        "2026-02",
        allocations,
        [],
        transactions,
        [10],
      );
      expect(result).toBe(100); // 300 - 200 = 100 rolls forward
    });

    it("clamps negative balance to 0 (overspend resets)", () => {
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 100,
          createdAt: null,
        },
      ];
      const transactions = [
        {
          id: 1,
          accountId: 1,
          categoryId: 10,
          date: "2026-02-15",
          payee: "Shop",
          amount: -200,
          notes: null,
          cleared: true,
          reconciled: false,
          transferTransactionId: null,
          createdAt: null,
        },
      ];
      const result = computeRollover(
        1,
        "2026-03",
        "2026-02",
        allocations,
        [],
        transactions,
        [10],
      );
      expect(result).toBe(0); // 100 - 200 = -100 → clamped to 0
    });

    it("includes transfers in rollover calculation", () => {
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 100,
          createdAt: null,
        },
      ];
      const transfers = [
        {
          id: 1,
          fromEnvelopeId: 2,
          toEnvelopeId: 1,
          month: "2026-02",
          amount: 50,
          notes: null,
          createdAt: null,
        },
      ];
      const result = computeRollover(
        1,
        "2026-03",
        "2026-02",
        allocations,
        transfers,
        [],
        [],
      );
      expect(result).toBe(150); // 100 + 50 transfer in
    });
  });

  describe("computeOverspendForMonth", () => {
    it("returns 0 when no envelopes are overspent", () => {
      const envelopes = [
        {
          id: 1,
          name: "Food",
          active: true,
          sortOrder: 0,
          createdAt: "2026-01-01",
        },
      ];
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 300,
          createdAt: null,
        },
      ];
      const mappings = [{ id: 1, envelopeId: 1, categoryId: 10 }];
      const transactions = [
        {
          id: 1,
          accountId: 1,
          categoryId: 10,
          date: "2026-02-15",
          payee: "Shop",
          amount: -200,
          notes: null,
          cleared: true,
          reconciled: false,
          transferTransactionId: null,
          createdAt: null,
        },
      ];
      const result = computeOverspendForMonth(
        envelopes,
        "2026-02",
        allocations,
        [],
        transactions,
        mappings,
      );
      expect(result).toBe(0);
    });

    it("returns absolute value of overspend", () => {
      const envelopes = [
        {
          id: 1,
          name: "Food",
          active: true,
          sortOrder: 0,
          createdAt: "2026-01-01",
        },
      ];
      const allocations = [
        {
          id: 1,
          envelopeId: 1,
          month: "2026-02",
          assigned: 100,
          createdAt: null,
        },
      ];
      const mappings = [{ id: 1, envelopeId: 1, categoryId: 10 }];
      const transactions = [
        {
          id: 1,
          accountId: 1,
          categoryId: 10,
          date: "2026-02-15",
          payee: "Shop",
          amount: -250,
          notes: null,
          cleared: true,
          reconciled: false,
          transferTransactionId: null,
          createdAt: null,
        },
      ];
      const result = computeOverspendForMonth(
        envelopes,
        "2026-02",
        allocations,
        [],
        transactions,
        mappings,
      );
      expect(result).toBe(150); // 100 - 250 = -150 → overspend of 150
    });
  });
});
```

- [ ] **Step 3: Run unit tests**

Run: `bun run test src/tests/unit/budget-summary.unit.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/hooks/budget-computations.ts src/hooks/useBudgetSummary.ts src/tests/unit/budget-summary.unit.test.ts
git commit -m "feat: extract budget computation functions + add unit tests"
```

---

## Chunk 5: Budget Page UI

### Task 15: Install Progress component + create page scaffold

**Files:**

- Create: `src/pages/Budget/BudgetPage.tsx`
- Create: `src/pages/Budget/MonthSelector.tsx`
- Modify: `src/App.tsx:20` (add lazy import + route)
- Modify: `src/components/header.tsx:17` (add nav link)

- [ ] **Step 1: Install shadcn Progress component**

```bash
bunx shadcn@latest add progress
```

- [ ] **Step 2: Read the installed Progress component to understand its API**

Read `src/components/ui/progress.tsx` before using it.

- [ ] **Step 3: Create MonthSelector.tsx**

```tsx
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  month: string; // YYYY-MM
  onChange: (month: string) => void;
};

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthSelector({ month, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium">
        {formatMonth(month)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Create BudgetPage.tsx scaffold**

```tsx
import { Layout } from "@/components/layout";
import { useBudgetSummary } from "@/hooks/useBudgetSummary";
import { useBudgetAllocations } from "@/hooks/useBudgetAllocations";
import { useEnvelopes } from "@/hooks/useEnvelopes";
import { MonthSelector } from "./MonthSelector";
import { useState } from "react";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function BudgetPage() {
  const [month, setMonth] = useState(currentMonth);
  const summary = useBudgetSummary(month);
  const { envelopes } = useEnvelopes();

  return (
    <Layout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Budget</h1>
            <p className="text-muted-foreground text-sm">
              Available to Budget:{" "}
              <span
                className={
                  summary.availableToBudget < 0
                    ? "text-destructive font-medium"
                    : summary.availableToBudget === 0
                      ? "text-green-600 font-medium"
                      : "text-foreground font-medium"
                }
              >
                £{summary.availableToBudget.toFixed(2)}
              </span>
            </p>
          </div>
          <MonthSelector month={month} onChange={setMonth} />
        </div>

        {envelopes.length === 0 ? (
          <div className="text-muted-foreground text-center py-12">
            No envelopes yet. Create one to start budgeting.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {summary.envelopes.map((env) => (
              <div key={env.envelopeId}>
                {/* EnvelopeRow goes here — Task 16 */}
                <p>
                  {env.name}: £{env.assigned} assigned, £{env.activity} activity
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 5: Add route to App.tsx**

Add lazy import after line 20:

```tsx
const BudgetPage = lazy(() => import("@/pages/Budget/BudgetPage"));
```

Add route after line 50 (`<Route path="/settings" ...>`):

```tsx
<Route path="/budget" element={<BudgetPage />} />
```

- [ ] **Step 6: Add nav link to header.tsx**

Change line 15-18 to:

```tsx
const navLinks = [
  { to: "/", label: "Accounts", end: true },
  { to: "/scheduled", label: "Reminders", end: false },
  { to: "/budget", label: "Budget", end: false },
];
```

- [ ] **Step 7: Verify types + lint**

Run: `bun run check-types && bun run lint`
Expected: Both PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/Budget/ src/components/ui/progress.tsx src/App.tsx src/components/header.tsx
git commit -m "feat: add Budget page scaffold with month selector + nav link"
```

---

### Task 16: EnvelopeRow component with progress bar + inline editing

**Files:**

- Create: `src/pages/Budget/EnvelopeRow.tsx`
- Modify: `src/pages/Budget/BudgetPage.tsx` (replace placeholder with EnvelopeRow)

- [ ] **Step 1: Create EnvelopeRow.tsx**

```tsx
import { Progress } from "@/components/ui/progress";
import { AlertTriangle } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  name: string;
  assigned: number;
  activity: number;
  available: number;
  underfunded: boolean;
  categoryNames: string[];
  onAssignedChange: (value: number) => void;
};

function progressColor(pct: number): string {
  if (pct > 100) return "bg-destructive";
  if (pct >= 80) return "bg-amber-500";
  return "bg-green-600";
}

export function EnvelopeRow({
  name,
  assigned,
  activity,
  available,
  underfunded,
  categoryNames,
  onAssignedChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(assigned));
  const inputRef = useRef<HTMLInputElement>(null);

  const spent = Math.abs(activity);
  const pct = assigned > 0 ? (spent / assigned) * 100 : activity < 0 ? 100 : 0;

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed !== assigned) {
      onAssignedChange(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") inputRef.current?.blur();
    if (e.key === "Escape") {
      setDraft(String(assigned));
      setEditing(false);
    }
  };

  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-center gap-4">
        <div className="min-w-[140px]">
          <div className="flex items-center gap-2">
            <span className="font-medium">{name}</span>
            {underfunded && <AlertTriangle className="size-4 text-amber-500" />}
          </div>
          <p className="text-muted-foreground text-xs">
            {categoryNames.join(" · ") || "No categories"}
          </p>
        </div>

        <div className="flex items-center gap-1 min-w-[120px]">
          <span className="text-muted-foreground text-xs">Assigned:</span>
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              step="0.01"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className="w-20 rounded border bg-background px-1 py-0.5 text-sm"
              autoFocus
            />
          ) : (
            <button
              onClick={() => {
                setDraft(String(assigned));
                setEditing(true);
              }}
              className="text-sm font-medium hover:underline"
            >
              £{assigned.toFixed(2)}
            </button>
          )}
        </div>

        <div className="flex-1">
          <Progress value={Math.min(pct, 100)} className="h-2" />
        </div>

        <div className="text-right min-w-[100px]">
          <span className="text-sm">
            £{spent.toFixed(2)} / £{assigned.toFixed(2)}
          </span>
        </div>

        <div className="text-right min-w-[80px]">
          <span
            className={`text-sm font-medium ${
              available < 0 ? "text-destructive" : "text-green-600"
            }`}
          >
            £{available.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
```

Note: The `Progress` component's indicator color may need a dynamic className. After reading the installed component file, adapt the `progressColor` logic to apply the color via the component's API (e.g. CSS variable, className prop, or wrapping styles). Adjust as needed based on the actual Progress component API.

- [ ] **Step 2: Wire EnvelopeRow into BudgetPage.tsx**

Replace the placeholder `<p>` in BudgetPage with the `EnvelopeRow` component. The `onAssignedChange` callback calls `allocations.upsert.mutate({ envelopeId: env.envelopeId, assigned: value })`.

Also add:

- Category name lookup (from `useCategories` + `useEnvelopeCategories`)
- Quick Fill button next to the month selector

- [ ] **Step 3: Verify types + lint**

Run: `bun run check-types && bun run lint`
Expected: Both PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Budget/EnvelopeRow.tsx src/pages/Budget/BudgetPage.tsx
git commit -m "feat: add EnvelopeRow with progress bar, inline assigned editing"
```

---

### Task 17: Unbudgeted spending section

**Files:**

- Create: `src/pages/Budget/UnbudgetedSection.tsx`
- Modify: `src/pages/Budget/BudgetPage.tsx` (add section at bottom)

- [ ] **Step 1: Create UnbudgetedSection.tsx**

```tsx
type UnbudgetedCategory = {
  categoryId: number;
  name: string;
  amount: number;
};

type Props = {
  total: number;
  categories: UnbudgetedCategory[];
};

export function UnbudgetedSection({ total, categories }: Props) {
  if (categories.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-dashed p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-muted-foreground">
            Unbudgeted Spending
          </span>
          <p className="text-muted-foreground text-xs">
            {categories.map((c) => c.name).join(" · ")}
          </p>
        </div>
        <span className="text-destructive text-sm font-medium">
          £{Math.abs(total).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add to BudgetPage after envelope list**

- [ ] **Step 3: Verify types + lint**

Run: `bun run check-types && bun run lint`
Expected: Both PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Budget/UnbudgetedSection.tsx src/pages/Budget/BudgetPage.tsx
git commit -m "feat: add unbudgeted spending section to budget page"
```

---

## Chunk 6: Envelope Management UI

### Task 18: Move Money dialog

**Files:**

- Create: `src/pages/Budget/MoveMoneyDialog.tsx`
- Modify: `src/pages/Budget/BudgetPage.tsx` (add trigger)

- [ ] **Step 1: Install Dialog component if not present**

Check if `src/components/ui/dialog.tsx` exists. If not: `bunx shadcn@latest add dialog`

- [ ] **Step 2: Create MoveMoneyDialog.tsx**

A dialog with:

- "From" envelope select (pre-filled if opened from a specific row)
- "To" envelope select
- Amount input
- Optional notes
- Submit calls `budgetTransfers.create.mutate()`

Use existing Select/Combobox components from `src/components/ui/`.

When displaying transfer audit trail (e.g. in a future history view), inactive envelope names must render with a "(deleted)" suffix per spec.

- [ ] **Step 3: Wire trigger into BudgetPage**

Add a "Move Money" button in the page header and/or a context menu on each EnvelopeRow.

- [ ] **Step 4: Verify types + lint**

Run: `bun run check-types && bun run lint`
Expected: Both PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Budget/MoveMoneyDialog.tsx src/pages/Budget/BudgetPage.tsx
git commit -m "feat: add move-money dialog with audit trail"
```

---

### Task 19: Create/Edit Envelope dialog

**Files:**

- Create: `src/pages/Budget/EnvelopeFormDialog.tsx`
- Modify: `src/pages/Budget/BudgetPage.tsx` (add "New Envelope" button)

- [ ] **Step 1: Create EnvelopeFormDialog.tsx**

A dialog with:

- Name text input
- Category multi-select picker:
  - Show categories in hierarchy (parent → children)
  - Grey out categories already mapped to other envelopes
  - Only show expense-type categories
- On save: create envelope, then create envelope_categories mappings
- On edit: update name, diff mappings (delete removed, create added)

- [ ] **Step 2: Wire into BudgetPage**

"New Envelope" button in page header opens the dialog. Each EnvelopeRow gets an edit button that opens the dialog pre-filled.

- [ ] **Step 3: Add delete confirmation**

When deleting an envelope, show a confirmation dialog warning that categories will be unmapped. On confirm:

1. Call `deleteEnvelopeCategoriesByEnvelope(envelopeId)` to unmap categories
2. Call `deleteEnvelope(envelopeId)` to soft-delete

- [ ] **Step 4: Verify types + lint**

Run: `bun run check-types && bun run lint`
Expected: Both PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Budget/EnvelopeFormDialog.tsx src/pages/Budget/BudgetPage.tsx
git commit -m "feat: add envelope create/edit/delete dialog with category picker"
```

---

### Task 20: Budget onboarding + templates

**Files:**

- Create: `src/pages/Budget/budget-templates.ts`
- Create: `src/pages/Budget/BudgetOnboarding.tsx`
- Modify: `src/pages/Budget/BudgetPage.tsx` (show onboarding when no envelopes)

- [ ] **Step 1: Create budget-templates.ts**

```ts
export type BudgetTemplate = {
  name: string;
  description: string;
  envelopes: {
    name: string;
    categoryPatterns: string[]; // matched by name against seed categories
  }[];
};

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    name: "Starter",
    description: "5 envelopes covering common spending areas",
    envelopes: [
      { name: "Bills", categoryPatterns: ["Bills", "Council Tax", "Mobile"] },
      { name: "Food", categoryPatterns: ["Groceries"] },
      {
        name: "Transport",
        categoryPatterns: ["Motoring", "Petrol", "Parking"],
      },
      {
        name: "Personal",
        categoryPatterns: ["Clothing", "Entertainment", "Fitness"],
      },
      { name: "Savings", categoryPatterns: [] },
    ],
  },
  {
    name: "Detailed",
    description: "8 envelopes with finer-grained category mapping",
    envelopes: [
      { name: "Mortgage/Rent", categoryPatterns: ["Rent", "Mortgage"] },
      { name: "Utilities", categoryPatterns: ["Electric", "Gas", "Water"] },
      {
        name: "Insurance",
        categoryPatterns: [
          "Insurance",
          "Home Insurance",
          "Car Insurance",
          "Life Insurance",
        ],
      },
      { name: "Food", categoryPatterns: ["Groceries", "Dining out", "Wine"] },
      {
        name: "Transport",
        categoryPatterns: ["Motoring", "Petrol", "Parking", "Travel"],
      },
      {
        name: "Healthcare",
        categoryPatterns: ["Healthcare", "Dentist", "Optician"],
      },
      {
        name: "Personal",
        categoryPatterns: [
          "Clothing",
          "Entertainment",
          "Fitness",
          "Personal care",
        ],
      },
      { name: "Savings", categoryPatterns: [] },
    ],
  },
  {
    name: "Minimal",
    description: "3 broad envelopes — keep it simple",
    envelopes: [
      {
        name: "Essentials",
        categoryPatterns: [
          "Bills",
          "Council Tax",
          "Groceries",
          "Motoring",
          "Mobile",
          "Insurance",
        ],
      },
      {
        name: "Everything Else",
        categoryPatterns: [
          "Clothing",
          "Entertainment",
          "Fitness",
          "Dining out",
          "Holiday",
        ],
      },
      { name: "Savings", categoryPatterns: [] },
    ],
  },
];
```

- [ ] **Step 2: Create BudgetOnboarding.tsx**

Shows when `envelopes.length === 0`:

- Heading: "Get started with budgeting"
- Brief explanation of envelope budgeting
- Template cards (Starter, Detailed, Minimal) with name + description
- "Create from scratch" button
- On template select: create envelopes + match category names to seed categories + create mappings

- [ ] **Step 3: Wire into BudgetPage**

Replace the empty state placeholder with `<BudgetOnboarding />`.

- [ ] **Step 4: Verify types + lint**

Run: `bun run check-types && bun run lint`
Expected: Both PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Budget/budget-templates.ts src/pages/Budget/BudgetOnboarding.tsx src/pages/Budget/BudgetPage.tsx
git commit -m "feat: add budget onboarding with 3 template options"
```

---

## Chunk 7: Reports Plan Update + Final Verification

### Task 21: Update reports plan

**Files:**

- Modify: `.ai-plans/reports-page.md`

- [ ] **Step 1: Remove budgetClass references**

Search for `budgetClass`, `budget_class`, `50/30/20` in `.ai-plans/reports-page.md` and remove those references. The reports plan's spending-by-category donut should not mention budgetClass colouring.

- [ ] **Step 2: Add Budget vs Actual note**

Add a note in the reports plan that a "Budget vs Actual" chart (per-envelope assigned vs spent by month) is a natural addition once envelope budgeting exists — deferred to v2 of reports.

- [ ] **Step 3: Update old budgeting plan**

Replace `.ai-plans/budgeting-feature.md` with a note that it has been superseded by the envelope budgeting spec at `docs/superpowers/specs/2026-03-12-envelope-budgeting-design.md`.

- [ ] **Step 4: Commit**

```bash
git add .ai-plans/
git commit -m "docs: update reports plan (remove 50/30/20), mark old budget plan superseded"
```

---

### Task 22: Final verification

- [ ] **Step 1: Rebuild db.js**

```bash
bun run vite build --config vite.main.config.ts
```

- [ ] **Step 2: Run all linting + type checks**

```bash
bun run lint && bun run check-types
```

Expected: Both PASS with zero errors

- [ ] **Step 3: Run all tests**

```bash
bun run test
```

Expected: All tests PASS (existing + new integration + unit)

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A
git commit -m "chore: final fixups for envelope budgeting feature"
```

---

## Unresolved Questions

- Progress bar indicator colour: shadcn Progress may need CSS override for green/amber/red — check component API after install
- Category picker in EnvelopeFormDialog: may need a custom tree-select component if existing Combobox doesn't handle hierarchy well enough
- Template category matching: pattern matching by name is fragile if user renamed seed categories — acceptable for v1?
- Template "Bills + children" mapping: the application logic must traverse the parent-child category tree (using `parentId`) to include all children of matched categories, not just exact name matches
