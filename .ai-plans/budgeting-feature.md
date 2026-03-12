# Budgeting Feature — 50/30/20 Rule

## Context

The app tracks transactions by category but has no budgeting view. BUDGETING.md describes a 50/30/20 model (Needs/Wants/Savings). This plan adds a `budgetClass` to categories and a new Budget page showing spend vs targets per bucket.

**Scope**: Phases 1-3 only. Adjustments (phase 4) and AI classification (phase 5) deferred.

**Decisions**:
- Zero-income months → targets are £0 (use actual income only)
- Ratios editable in settings (stored in `preferences` JSON on existing `settings` table)
- Mixed parent categories (e.g. Food) → leave parent unclassified, classify children only
- Child categories inherit parent's `budgetClass` at query time unless explicitly set

---

## Phase 1: Schema — add `budget_class` to categories

**Migration `0009_budget_class.sql`**:
```sql
ALTER TABLE categories ADD COLUMN budget_class TEXT;
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account_date ON transactions(account_id, date);
```

Plus UPDATE statements to pre-classify seed categories:
- **need**: Bills (+ all children), Council Tax, Food > Groceries, Healthcare (+ children), Home, Household (+ children), Insurance (+ children), Loan (+ children), Mobile, Motoring (+ children), School, Taxes, Education
- **want**: Allowance, Clothing, Entertainment, Fitness, Gifts, Holiday, Parking, Personal care, Pet care, Pets, Travel, Food > Dining out, Food > Wine, Cash withdrawal, Business expense (+ children)
- **want**: Charitable donation (grouped with wants above)
- **skip**: income-type categories (Salary, Interest, etc.), Transfer, Food (parent), Miscellaneous

**Files**:
1. `src/main/db/schema.ts` — add `budgetClass` column with enum `["need", "want", "saving"]`
2. `src/main/db/migrations/0009_budget_class.sql`
3. `src/main/db/migrations/meta/_journal.json` — add entry idx 9
4. `src/main/db/migrations/meta/0009_snapshot.json`
5. Rebuild `public/db.js` via `bun run vite build --config vite.main.config.ts`

No new IPC — existing categories CRUD handles all columns.

---

## Phase 2: CategoryForm — budgetClass selector

**`src/pages/Categories/CategoryForm.tsx`**:
- Add Select for `budgetClass`: Need, Want, Saving, (none)
- Only show when `expenseType === 'expense'`

**`src/pages/Categories/Categories.tsx`**:
- Show budgetClass badge on each category row (colour-coded: blue=need, orange=want, green=saving)

---

## Phase 3: Budget page + summary hook

### 3a. Shared IPC: `transactions:getByDateRange`

Shared with the reports feature. Added in `public/ipc/transactions.js`:
```js
ipcMain.handle("transactions:getByDateRange", (_, startDate, endDate, accountIds) => { ... });
```

Budgeting calls it with month start/end dates: `getTransactionsByDateRange("2026-03-01", "2026-03-31")`.

See `reports-page.md` Phase 1 for full implementation. Wire through `preload.js` + `electron.d.ts`.

### 3b. Budget ratios in preferences

Store in existing `settings.preferences` JSON:
```json
{ "budgetRatios": { "need": 50, "want": 30, "saving": 20 } }
```

Default to 50/30/20 when unset. Use existing `usePreferences` hook to read/write.

Add a small "Edit ratios" dialog on the Budget page (three number inputs that must sum to 100).

### 3c. Hook: `src/hooks/useBudgetSummary.ts`

`useBudgetSummary(month: string)` — fetches transactions for month + all categories + preferences. Returns:
- `totalIncome`: sum of transactions where category.expenseType = 'income'
- Per bucket (`need`/`want`/`saving`): `{ target, spent, remaining }`
  - `target` = totalIncome × ratio / 100
  - `spent` = abs(sum of negative transactions in bucket)
- `unclassified`: spend on categories with no budgetClass (and no classified parent)
- `byCategory`: per-category spend grouped by bucket (for breakdown table)

Inheritance logic: if category has no `budgetClass`, check parent's `budgetClass`.

### 3d. Page: `src/pages/Budget/BudgetPage.tsx`

**Route**: `/budget` in `App.tsx`
**Nav**: add "Budget" link to `src/components/header.tsx`

**Layout**:
- Month selector at top (< prev | "March 2026" | next >)
- Income summary line
- Three bucket cards in a row:
  - Label + ratio (e.g. "Needs · 50%")
  - Progress bar (green < 80%, amber 80-100%, red > 100%)
  - Spent / Target amounts
- Stacked horizontal bar (recharts) — visual 50/30/20 split with spend overlay
- Breakdown table grouped by bucket → category → amount
- "Edit ratios" button opens small dialog
- Unclassified section at bottom (if any) with link to Categories page

**New files**:
- `src/pages/Budget/BudgetPage.tsx`
- `src/hooks/useBudgetSummary.ts`

---

## Future phases (out of scope)

**Phase 4**: Budget adjustments — "borrow" between buckets via `budget_adjustments` table
**Phase 5**: AI classification — Claude API or Ollama "auto-classify" button for unclassified categories

### AI classification options researched

| Approach | Pros | Cons | Best for |
|----------|------|------|----------|
| **Rule-based** (keyword map) | Zero deps, instant, offline | Only works for known names | Seed categories (done in migration) |
| **Claude API** (batch call) | Most accurate, cheap (<$0.01) | Needs API key, network | "Auto-classify" button |
| **Ollama** (local LLM) | Private, no API cost | Requires install + ~2GB model | Privacy-focused |
| **transformers.js** | Bundled, offline | Large bundle, overkill | Not recommended |

**Recommendation**: Rule-based for seeds (phase 1). Future "Auto-classify" button via Claude API using `@anthropic-ai/sdk`.

---

## Verification

1. `bun run vite build --config vite.main.config.ts` — rebuilds db.js
2. `bun run lint && bun run check-types` — clean
3. `bun run test` — all pass
4. Manual: Categories page → budgetClass selector + badges work
5. Manual: /budget → buckets show correct totals for a month with transactions
6. Manual: edit ratios → targets recalculate

---

## Unresolved questions

- ~~Charitable donation~~: want (resolved)
- Miscellaneous: leave unclassified? (plan says yes)
- Bank charge: need or want? (plan says skip — debatable, could be need)
