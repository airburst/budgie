# Test Coverage — Implementation Tasks

> After completing each phase: tick the boxes, then run `/compact` before starting the next phase.

---

## Phase 1 — Prerequisites (refactors)

- [ ] Extract `buildForecastRows` (and `formatCurrency` helper used by it) from `src/pages/Forecast/ForecastPage.tsx` into `src/lib/forecast.ts`
- [ ] Update `ForecastPage.tsx` to import from `src/lib/forecast.ts`
- [ ] Extract running-balance memo logic from `src/pages/AccountTransactions/TransactionsTable.tsx` into `src/lib/balances.ts`
- [ ] Update `TransactionsTable.tsx` to import from `src/lib/balances.ts`
- [ ] `bun run lint` — zero errors
- [ ] `bun run check-types` — zero errors

---

## Phase 2 — Vitest workspace config

- [ ] Create `vitest.workspace.ts` with two projects:
  - `unit` — environment: happy-dom, glob: `src/**/*.test.{ts,tsx}` (excludes `src/tests/integration`)
  - `integration` — environment: node, glob: `src/tests/integration/**/*.test.ts`, setupFiles: `src/tests/integration/setup.ts`
- [ ] Remove the `test:` block from `vite.config.ts` and replace with workspace reference
- [ ] Update `package.json` `"test"` script to `vitest run` (no change needed if already correct)
- [ ] Existing recurrence tests still pass (`bun run test`)
- [ ] `bun run lint` — zero errors
- [ ] `bun run check-types` — zero errors

---

## Phase 3 — Integration test infrastructure

- [ ] Create `src/tests/integration/setup.ts` — pins system time to `2026-03-07` via `vi.setSystemTime`
- [ ] Create `src/tests/integration/helpers/db.ts` — `createTestDb()` opens in-memory SQLite, runs real migrations, returns `{ db, schema, teardown }`
- [ ] Create `src/tests/integration/helpers/ipc.ts` — `createMockIpc()` returns `{ ipcMain, invoke }` where ipcMain captures handlers in a Map
- [ ] Create `src/tests/integration/helpers/fixtures.ts` — full fixture definitions with derived expected balances documented in comments:
  - Account A: Current Account, checking, £1,000 opening → `computedBalance £4,611.70` / `clearedBalance £4,702.20`
  - Account B: Savings, savings, £5,000 opening → `computedBalance £6,512.50` / `clearedBalance £6,512.50`
  - 4 new categories (Groceries/Food, Salary, Utilities, Freelance)
  - 7 transactions for Account A (5 cleared, 2 uncleared)
  - 3 transactions for Account B (all cleared)
  - 6 scheduled transactions for Account A (every frequency and end-condition variant)
  - 3 scheduled transactions for Account B
- [ ] `bun run lint` — zero errors
- [ ] `bun run check-types` — zero errors

---

## Phase 4 — Unit tests

- [ ] Create `src/tests/unit/forecast.unit.test.ts`:
  - [ ] Empty inputs → single balance point at baseBalance
  - [ ] Single future real transaction on correct date
  - [ ] Monthly scheduled expands correctly across 3-month window (count + dates + amounts)
  - [ ] Exclusion toggle removes entry from running balance
  - [ ] Negative balance passes through unclamped
  - [ ] Scheduled rule ending before window end — no entries after end date
  - [ ] Two different accountIds never bleed into each other
- [ ] Create `src/tests/unit/balances.unit.test.ts`:
  - [ ] Correct per-row cumulative balance for known sorted transaction set
  - [ ] Same-date transactions sorted deterministically by id
  - [ ] Single transaction: opening + amount
- [ ] All unit tests pass (`bun run test`)
- [ ] `bun run lint` — zero errors
- [ ] `bun run check-types` — zero errors

---

## Phase 5 — `accounts.test.ts`

- [ ] Create `src/tests/integration/accounts.test.ts`
- [ ] `getAll` returns empty array on fresh DB
- [ ] Create Account A → `getById` returns exact fields
- [ ] Create Account B → `getAll` returns 2 rows
- [ ] `computedBalance` = opening balance with no transactions (both accounts)
- [ ] `clearedBalance` = opening balance with no transactions (both accounts)
- [ ] After inserting fixture transactions: Account A `computedBalance` = £4,611.70
- [ ] After inserting fixture transactions: Account A `clearedBalance` = £4,702.20
- [ ] After inserting fixture transactions: Account B `computedBalance` = £6,512.50
- [ ] Update account name → `getById` reflects change
- [ ] Delete account → `getAll` returns 1 row
- [ ] All integration tests pass (`bun run test`)
- [ ] `bun run lint` — zero errors
- [ ] `bun run check-types` — zero errors

---

## Phase 6 — `categories.test.ts`

- [ ] Create `src/tests/integration/categories.test.ts`
- [ ] Seeded categories present on fresh DB (known names from `0001_seed_categories.sql`)
- [ ] Create top-level category (Salary, income) — parentId is null
- [ ] Create child category (Groceries under Food) — parentId = Food's id
- [ ] `getAll` excludes soft-deleted rows
- [ ] Hard-delete with no linked transactions: row is gone from DB
- [ ] Hard-delete with linked transactions: row marked deleted, excluded from `getAll`
- [ ] Update category name → reflected in `getById`
- [ ] All integration tests pass (`bun run test`)
- [ ] `bun run lint` — zero errors
- [ ] `bun run check-types` — zero errors

---

## Phase 7 — `transactions.test.ts`

- [ ] Create `src/tests/integration/transactions.test.ts`
- [ ] Create Account A transactions → `getByAccount` returns correct count
- [ ] `getByAccount` excludes Account B's transactions (isolation)
- [ ] Account A `computedBalance` = £4,611.70 after all fixture transactions
- [ ] Account A `clearedBalance` = £4,702.20
- [ ] Toggle one uncleared transaction to cleared → `clearedBalance` increases correctly
- [ ] Delete one transaction → `computedBalance` adjusts by that amount
- [ ] Running balance array from `computeRunningBalances()` is correct per-row for known data
- [ ] All integration tests pass (`bun run test`)
- [ ] `bun run lint` — zero errors
- [ ] `bun run check-types` — zero errors

---

## Phase 8 — `scheduled.test.ts`

- [ ] Create `src/tests/integration/scheduled.test.ts`
- [ ] Create all 9 fixture scheduled transactions
- [ ] `getAll` returns all 9
- [ ] `nextDueDate` for "Monthly on 1st" (Monthly Salary) = `2026-04-01`
- [ ] `nextDueDate` for "Once 2026-05-15" (Dentist) = `2026-05-15`
- [ ] `nextDueDate` for "Weekly every Monday" (Gym) = `2026-03-09`
- [ ] `nextDueDate` for "Monthly on 20th" (Standing Order) = `2026-03-20`
- [ ] RRule expansion for Council Tax (COUNT=10) over 12 months produces ≤ 10 occurrences
- [ ] Netflix (COUNT=6, every other month) produces ≤ 6 occurrences in any window
- [ ] Gym UNTIL=2026-07-01: no occurrences after 2026-07-01
- [ ] Update Gym amount → `getById` reflects new amount
- [ ] Delete Gym → `getAll` returns 8 rows
- [ ] All integration tests pass (`bun run test`)
- [ ] `bun run lint` — zero errors
- [ ] `bun run check-types` — zero errors

---

## Phase 9 — `forecast.test.ts` (the main workflow)

- [ ] Create `src/tests/integration/forecast.test.ts`
- [ ] `beforeAll` seeds full fixture state (accounts + categories + transactions + scheduled)

### Section 1 — Baseline balances

- [ ] Account A `computedBalance` = £4,611.70
- [ ] Account B `computedBalance` = £6,512.50

### Section 2 — Forecast 3 months (to 2026-06-07)

- [ ] Row count matches expected scheduled occurrences in window
- [ ] Final balance at 2026-06-07 = baseBalance + sum of all scheduled amounts with dates ≤ 2026-06-07
- [ ] Dentist (2026-05-15) does NOT appear in 3-month window

### Section 3 — Forecast 6 months (to 2026-09-07)

- [ ] Dentist (2026-05-15) appears exactly once
- [ ] Netflix does not exceed COUNT=6 in window
- [ ] Final balance at 2026-09-07 computed exactly

### Section 4 — Forecast 12 months (to 2027-03-07)

- [ ] Birthday Transfer (annual) appears exactly once
- [ ] Annual Insurance on Account B appears exactly once
- [ ] Council Tax: last occurrence respects COUNT=10, nothing after
- [ ] Gym: last occurrence ≤ 2026-07-01, nothing after
- [ ] Final balance at 2027-03-07 computed exactly

### Section 5 — Delete uncleared transactions → revisit forecasts

- [ ] Delete Account A's two uncleared transactions
- [ ] Account A `computedBalance` = £4,702.20
- [ ] 3-month end balance = previous 3-month end balance + £90.50 (78.00 + 12.50)
- [ ] 6-month end balance shifts by same £90.50
- [ ] 12-month end balance shifts by same £90.50

### Section 6 — Modify/delete scheduled tasks → revisit forecasts

- [ ] Change Gym amount −£45.00 → −£50.00; 3-month balance decreases by N×£5.00 where N = Mondays before 2026-06-07
- [ ] Delete Gym entirely; 3-month balance increases by full Gym total in window
- [ ] Delete Gym; 12-month forecast loses only occurrences ≤ 2026-07-01
- [ ] Delete Council Tax; 12-month balance increases by sum of its COUNT-limited occurrences in window

### Final checks

- [ ] All integration tests pass (`bun run test`)
- [ ] `bun run lint` — zero errors
- [ ] `bun run check-types` — zero errors
