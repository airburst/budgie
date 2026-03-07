# Test Coverage — Implementation Tasks

> After completing each phase: tick the boxes before starting the next phase.

---

## Phase 1 — Prerequisites (refactors)

- [x] Extract `buildForecastRows` (and `formatCurrency` helper used by it) from `src/pages/Forecast/ForecastPage.tsx` into `src/lib/forecast.ts`
- [x] Update `ForecastPage.tsx` to import from `src/lib/forecast.ts`
- [x] Extract running-balance memo logic from `src/pages/AccountTransactions/TransactionsTable.tsx` into `src/lib/balances.ts`
- [x] Update `TransactionsTable.tsx` to import from `src/lib/balances.ts`
- [x] `bun run lint` — zero errors
- [x] `bun run check-types` — zero errors

---

## Phase 2 — Vitest workspace config

- [x] Create `vitest.config.ts` with two projects (vitest 4 uses `test.projects` not workspace files):
  - `unit` — environment: happy-dom, glob: `src/**/*.test.{ts,tsx}` (excludes `src/tests/integration`)
  - `integration` — environment: node, glob: `src/tests/integration/**/*.test.ts`, setupFiles: `src/tests/integration/setup.ts`
- [x] Remove the `test:` block from `vite.config.ts`
- [x] Update `package.json` `"test"` script to `vitest run` (no change needed if already correct)
- [x] Existing recurrence tests still pass (`bun run test`)
- [x] `bun run lint` — zero errors
- [x] `bun run check-types` — zero errors

---

## Phase 3 — Integration test infrastructure

- [x] Create `src/tests/integration/setup.ts` — pins system time to `2026-03-07` via `vi.setSystemTime`
- [x] Create `src/tests/integration/helpers/db.ts` — `createTestDb()` opens in-memory SQLite, runs real migrations, returns `{ db, schema, teardown }`
- [x] Create `src/tests/integration/helpers/ipc.ts` — `createMockIpc()` + `registerAllHandlers()` (loads CJS handlers via `createRequire`)
- [x] Create `src/tests/integration/helpers/fixtures.ts` — full fixture definitions with derived expected balances documented in comments:
  - Account A: Current Account, bank type, £1,000 opening → `computedBalance 4611.70` / `clearedBalance 4702.20`
  - Account B: Savings Account, bank type, £5,000 opening → `computedBalance 6512.50` / `clearedBalance 6512.50`
  - 7 transactions for Account A (5 cleared, 2 uncleared summing to −90.50)
  - 3 transactions for Account B (all cleared)
  - 6 scheduled transactions for Account A (every frequency and end-condition variant)
  - 3 scheduled transactions for Account B
  - NOTE: Dentist date changed to 2026-07-15 so it falls outside 3-month window but inside 6-month window
- [x] `bun run lint` — zero errors
- [x] `bun run check-types` — zero errors

---

## Phase 4 — Unit tests

- [x] Create `src/tests/unit/forecast.unit.test.ts`:
  - [x] Empty inputs → single balance point at baseBalance
  - [x] Single future real transaction on correct date
  - [x] Monthly scheduled expands correctly across 3-month window (count + dates + amounts)
  - [x] Exclusion toggle removes entry from running balance
  - [x] Negative balance passes through unclamped
  - [x] Scheduled rule ending before window end — no entries after end date
  - [x] Two different accountIds never bleed into each other
- [x] Create `src/tests/unit/balances.unit.test.ts`:
  - [x] Correct per-row cumulative balance for known sorted transaction set
  - [x] Same-date transactions sorted deterministically by id
  - [x] Single transaction: opening + amount
- [x] All unit tests pass (`bun run test`)
- [x] `bun run lint` — zero errors
- [x] `bun run check-types` — zero errors

---

## Phase 5 — `accounts.test.ts`

- [x] Create `src/tests/integration/accounts.test.ts`
- [x] `getAll` returns empty array on fresh DB
- [x] Create Account A → `getById` returns exact fields
- [x] Create Account B → `getAll` returns 2 rows
- [x] `computedBalance` = opening balance with no transactions (both accounts)
- [x] `clearedBalance` = opening balance with no transactions (both accounts)
- [x] After inserting fixture transactions: Account A `computedBalance` = £4,611.70
- [x] After inserting fixture transactions: Account A `clearedBalance` = £4,702.20
- [x] After inserting fixture transactions: Account B `computedBalance` = £6,512.50
- [x] Update account name → `getById` reflects change
- [x] Delete account → `getAll` returns 1 row
- [x] All integration tests pass (`bun run test`)
- [x] `bun run lint` — zero errors
- [x] `bun run check-types` — zero errors

---

## Phase 6 — `categories.test.ts`

- [x] Create `src/tests/integration/categories.test.ts`
- [x] Seeded categories present on fresh DB (known names from `0001_seed_categories.sql`)
- [x] Create top-level category (Salary, income) — parentId is null
- [x] Create child category (Groceries under Food) — parentId = Food's id
- [x] `getAll` excludes soft-deleted rows
- [x] Hard-delete with no linked transactions: row is gone from DB
- [x] Hard-delete with linked transactions: row marked deleted, excluded from `getAll`
- [x] Update category name → reflected in `getById`
- [x] All integration tests pass (`bun run test`)
- [x] `bun run lint` — zero errors
- [x] `bun run check-types` — zero errors

---

## Phase 7 — `transactions.test.ts`

- [x] Create `src/tests/integration/transactions.test.ts`
- [x] Create Account A transactions → `getByAccount` returns correct count
- [x] `getByAccount` excludes Account B's transactions (isolation)
- [x] Account A `computedBalance` = £4,611.70 after all fixture transactions
- [x] Account A `clearedBalance` = £4,702.20
- [x] Toggle one uncleared transaction to cleared → `clearedBalance` increases correctly
- [x] Delete one transaction → `computedBalance` adjusts by that amount
- [x] Running balance array from `computeRunningBalances()` is correct per-row for known data
- [x] All integration tests pass (`bun run test`)
- [x] `bun run lint` — zero errors
- [x] `bun run check-types` — zero errors

---

## Phase 8 — `scheduled.test.ts`

- [x] Create `src/tests/integration/scheduled.test.ts`
- [x] Create all 9 fixture scheduled transactions
- [x] `getAll` returns all 9
- [x] `nextDueDate` for "Monthly on 1st" (Monthly Salary) = `2026-04-01`
- [x] `nextDueDate` for "Once 2026-05-15" (Dentist) = `2026-05-15`
- [x] `nextDueDate` for "Weekly every Monday" (Gym) = `2026-03-09`
- [x] `nextDueDate` for "Monthly on 20th" (Standing Order) = `2026-03-20`
- [x] RRule expansion for Council Tax (COUNT=10) over 12 months produces ≤ 10 occurrences
- [x] Netflix (COUNT=6, every other month) produces ≤ 6 occurrences in any window
- [x] Gym UNTIL=2026-07-01: no occurrences after 2026-07-01
- [x] Update Gym amount → `getById` reflects new amount
- [x] Delete Gym → `getAll` returns 8 rows
- [x] All integration tests pass (`bun run test`)
- [x] `bun run lint` — zero errors
- [x] `bun run check-types` — zero errors

---

## Phase 9 — `forecast.test.ts` (the main workflow)

- [x] Create `src/tests/integration/forecast.test.ts`
- [x] `beforeAll` seeds full fixture state (accounts + categories + transactions + scheduled)

### Section 1 — Baseline balances

- [x] Account A `computedBalance` = £4,611.70
- [x] Account B `computedBalance` = £6,512.50

### Section 2 — Forecast 3 months (to 2026-06-07)

- [x] Row count matches expected scheduled occurrences in window
- [x] Final balance at 2026-06-07 = baseBalance + sum of all scheduled amounts with dates ≤ 2026-06-07
- [x] Dentist (2026-05-15) does NOT appear in 3-month window

### Section 3 — Forecast 6 months (to 2026-09-07)

- [x] Dentist (2026-05-15) appears exactly once
- [x] Netflix does not exceed COUNT=6 in window
- [x] Final balance at 2026-09-07 computed exactly

### Section 4 — Forecast 12 months (to 2027-03-07)

- [x] Birthday Transfer (annual) appears exactly once
- [x] Annual Insurance on Account B appears exactly once
- [x] Council Tax: last occurrence respects COUNT=10, nothing after
- [x] Gym: last occurrence ≤ 2026-07-01, nothing after
- [x] Final balance at 2027-03-07 computed exactly

### Section 5 — Delete uncleared transactions → revisit forecasts

- [x] Delete Account A's two uncleared transactions
- [x] Account A `computedBalance` = £4,702.20
- [x] 3-month end balance = previous 3-month end balance + £90.50 (78.00 + 12.50)
- [x] 6-month end balance shifts by same £90.50
- [x] 12-month end balance shifts by same £90.50

### Section 6 — Modify/delete scheduled tasks → revisit forecasts

- [x] Change Gym amount −£45.00 → −£50.00; 3-month balance decreases by N×£5.00 where N = Mondays before 2026-06-07
- [x] Delete Gym entirely; 3-month balance increases by full Gym total in window
- [x] Delete Gym; 12-month forecast loses only occurrences ≤ 2026-07-01
- [x] Delete Council Tax; 12-month balance increases by sum of its COUNT-limited occurrences in window

### Final checks

- [x] All integration tests pass (`bun run test`)
- [x] `bun run lint` — zero errors
- [x] `bun run check-types` — zero errors
