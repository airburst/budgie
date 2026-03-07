# Test Coverage Plan — Budgie

## Guiding Principles

- **Integration tests are the priority.** The stated scenarios require end-to-end verification of SQL queries, balance calculations, and forecast projections together. Unit tests alone cannot catch the interaction bugs most likely to surface.
- **No Electron process needed.** The IPC handlers are plain functions registered on `ipcMain`. A mock `ipcMain` that records handlers and lets tests invoke them directly gives full coverage of the data layer without starting Electron.
- **In-memory SQLite.** Every integration test suite creates a fresh `:memory:` database, runs the real migrations, and tears it down. No test artifacts on disk, no shared state between suites.
- **Deterministic dates.** All integration tests pin "today" via a passed-in parameter or a vi.setSystemTime mock so forecast assertions never drift.
- **One prerequisite refactor.** `buildForecastRows` is currently defined inside `ForecastPage.tsx`. It must be extracted to `src/lib/forecast.ts` before it can be unit- or integration-tested cleanly. No other refactors are needed.

---

## 1. Prerequisites

### 1.1 Extract `buildForecastRows`

Move the pure function from `src/pages/Forecast/ForecastPage.tsx` to:

```
src/lib/forecast.ts
```

Signature stays identical. `ForecastPage.tsx` imports from that module. This is the only structural change required before testing begins.

### 1.2 Vitest Workspace Split

`vite.config.ts` currently embeds a single Vitest config with `environment: "happy-dom"`. Integration tests need a real Node.js environment (because `better-sqlite3` is a native Node addon). The fix is a **Vitest workspace** file:

```
vitest.workspace.ts          ← new
  project: "unit"            → environment: happy-dom, glob: **/*.test.{ts,tsx}
                               (existing component + recurrence tests land here)
  project: "integration"     → environment: node, glob: src/tests/integration/**/*.test.ts
                               setupFiles: src/tests/integration/setup.ts
```

The existing `vite.config.ts` vitest block is removed and replaced by the workspace reference.

---

## 2. Test Infrastructure (`src/tests/integration/helpers/`)

### `db.ts` — Test Database Factory

```typescript
createTestDb(): { db: DrizzleDB; schema: typeof schema; teardown: () => void }
```

- Opens `:memory:` SQLite via `better-sqlite3`
- Runs `migrate()` with the real migrations folder so every test starts from the correct schema state (including seeded categories from `0001`)
- `teardown()` closes the connection

### `ipc.ts` — Mock IPC Dispatcher

```typescript
createMockIpc(): { ipcMain: MockIpcMain; invoke(channel, ...args): Promise<unknown> }
```

- `ipcMain` is a plain object with a `handle(channel, fn)` method that stores handlers in a `Map`
- `invoke(channel, ...args)` calls the stored handler with `(null, ...args)`
- Used by every integration test: register all five handler modules against the mock, then test by calling `invoke()`

### `fixtures.ts` — Known Initial State

Declares the exact seed data used by the workflow tests. Hard-coded values mean the expected balances can be derived by hand and checked against assertions.

**Accounts:**

| # | Name | Type | Opening Balance |
|---|---|---|---|
| A | Current Account | checking | £1,000.00 |
| B | Savings | savings | £5,000.00 |

**Categories (new, created during test):**

| Name | Type | Parent |
|---|---|---|
| Groceries | expense | Food (seeded) |
| Salary | income | — |
| Utilities | expense | — |
| Freelance | income | — |

**Transactions — Account A (all dates relative to pinned "today" = 2026-03-07):**

| Date | Payee | Amount | Cleared |
|---|---|---|---|
| 2026-02-01 | Opening salary | +£2,500 | yes |
| 2026-02-10 | Supermarket | −£85.50 | yes |
| 2026-02-15 | Electricity | −£120.00 | yes |
| 2026-02-28 | Supermarket | −£92.30 | yes |
| 2026-03-01 | Salary March | +£2,500 | yes |
| 2026-03-05 | Supermarket | −£78.00 | **no** |
| 2026-03-06 | Coffee | −£12.50 | **no** |

computedBalance = 1000 + 2500 − 85.50 − 120 − 92.30 + 2500 − 78 − 12.50 = **£4,611.70**
clearedBalance = 1000 + 2500 − 85.50 − 120 − 92.30 + 2500 = **£4,702.20**

**Transactions — Account B:**

| Date | Payee | Amount | Cleared |
|---|---|---|---|
| 2026-01-15 | Transfer in | +£1,000 | yes |
| 2026-02-20 | Transfer in | +£500 | yes |
| 2026-03-01 | Interest | +£12.50 | yes |

computedBalance = 5000 + 1000 + 500 + 12.50 = **£6,512.50**
clearedBalance = same (all cleared)

**Scheduled Transactions — Account A:**

| Payee | Amount | RRule description | Occurrence |
|---|---|---|---|
| Monthly Salary | +£2,500 | Monthly on 1st, never ends | recurring |
| Netflix | −£15.99 | Monthly, every other month, ends after 6 | recurring |
| Council Tax | −£185.00 | Monthly, 10 occurrences | recurring |
| Gym | −£45.00 | Weekly every Monday, ends on 2026-07-01 | recurring |
| Dentist | −£80.00 | Once (2026-05-15) | one-off |
| Birthday Transfer | −£200.00 | Annually | recurring |

**Scheduled Transactions — Account B:**

| Payee | Amount | RRule description | Occurrence |
|---|---|---|---|
| Standing Order | +£500 | Monthly on 20th, never ends | recurring |
| ISA Transfer | −£300 | Monthly on 1st, never ends | recurring |
| Annual Insurance | −£420.00 | Annually | recurring |

---

## 3. Test Suites

### `accounts.test.ts`

Scope: `public/ipc/accounts.js` — the `withBalances` query and standard CRUD.

| Test | What is asserted |
|---|---|
| `getAll` returns empty array on fresh DB | — |
| Create Account A → `getById` returns it | id, name, type, balance fields exact |
| Create Account B → `getAll` returns 2 rows | order, field values |
| `computedBalance` = opening balance with no transactions | exact float |
| `clearedBalance` = opening balance with no transactions | exact float |
| After adding test transactions: `computedBalance` matches expected derived value | £4,611.70 for A |
| After adding test transactions: `clearedBalance` matches expected derived value | £4,702.20 for A |
| Update account name → `getById` reflects change | — |
| Delete account → `getAll` returns 1 row | — |

### `categories.test.ts`

Scope: `public/ipc/categories.js` — CRUD, parent/child, soft-delete fallback.

| Test | What is asserted |
|---|---|
| Seeded categories are present on fresh DB | known names present |
| Create top-level category (Salary, income) | id, parentId null |
| Create child category (Groceries under Food) | parentId = Food's id |
| `getAll` excludes soft-deleted rows | — |
| Hard-delete with no linked transactions: row gone | — |
| Hard-delete with linked transactions: row soft-deleted, still excluded from `getAll` | — |
| Update category name | — |

### `transactions.test.ts`

Scope: `public/ipc/transactions.js` + the running balance memo from `TransactionsTable`.

| Test | What is asserted |
|---|---|
| Create all Account A transactions → `getByAccount` returns them | count, sorted by date |
| `computedBalance` on account is correct after each batch | derived values |
| `clearedBalance` on account is correct | — |
| Toggle cleared on a transaction → `clearedBalance` updates | — |
| Delete a transaction → `computedBalance` adjusts | — |
| Running balance array (client-side memo) is correct for known transaction set | per-row values |
| `getByAccount` for Account B returns only B's transactions | isolation |

The running balance memo lives in `TransactionsTable.tsx`. It is a `useMemo` that is easily extracted into `src/lib/balances.ts` (a small, optional extraction) or tested via a shallow component render with mocked data. The plan recommends extraction.

### `scheduled.test.ts`

Scope: `public/ipc/scheduled-transactions.js` + `buildRRule` / `computeNextDueDate`.

| Test | What is asserted |
|---|---|
| Create each of the 9 scheduled transactions above | stored correctly |
| `getAll` returns all 9 | — |
| `nextDueDate` for "Monthly on 1st" is 2026-04-01 (given today = 2026-03-07, having just passed 2026-03-01) | exact date string |
| `nextDueDate` for "Once 2026-05-15" is 2026-05-15 | — |
| `nextDueDate` for "Weekly every Monday" is 2026-03-09 | — |
| RRule expansion for Council Tax over 12 months produces exactly correct number of dates | count |
| RRule expansion for ended rule (Netflix, 6 remaining) produces at most 6 occurrences in any window | count |
| Update scheduled amount → `getById` reflects it | — |
| Delete a scheduled transaction → `getAll` returns N−1 | — |

### `forecast.test.ts` — Primary Suite

This is the main application-level test. It runs the full scenario from requirements, using the complete fixture set and pinned date of 2026-03-07.

**Setup:** one `beforeAll` block creates the test DB, registers all handlers, creates all accounts, categories, transactions, and scheduled transactions from the fixtures.

#### Section 1 — Baseline balances before forecasting

```
Account A computedBalance  = £4,611.70
Account B computedBalance  = £6,512.50
```

#### Section 2 — Forecast 3 months (to 2026-06-07)

`buildForecastRows` is called with:
- all transactions for Account A (dates > 2026-03-07 are "future real transactions" — there are none in fixtures)
- all active scheduled transactions for Account A
- baseBalance = Account A computedBalance
- endDate = 2026-06-07

Assertions include:
- Balance after first Monthly Salary occurrence (2026-04-01): baseBalance + 2500 − 185 (council tax, same day) − 15.99 (Netflix, every other month — check if April is an occurrence) − 45×(count Mondays March 9 – March 31) etc.
- The test fixture values will be chosen carefully so the arithmetic can be computed exactly by hand before writing code, with a spreadsheet-like derivation stored in `fixtures.ts` as comments.
- Final balance at 2026-06-07 must equal exactly the sum of base + all scheduled amounts occurring in the window.

#### Section 3 — Forecast 6 months (to 2026-09-07)

Same approach. Additional assertions:
- The "Dentist" once-off (2026-05-15, −£80) appears exactly once in the 6-month window, not in the 3-month window.
- Netflix ends-after-6: verify the last occurrence is within the window and no occurrences appear beyond COUNT.
- Balance at 2026-09-07 computed exactly.

#### Section 4 — Forecast 12 months (to 2027-03-07)

Additional assertions:
- Birthday Transfer (annual) appears once.
- Annual Insurance on Account B appears once.
- Council Tax ends (10 occurrences from nextDueDate): verify last date and that nothing appears after.
- Gym ends on 2026-07-01: no Gym entries after that date.

#### Section 5 — Delete uncleared transactions → revisit forecasts

Delete Account A's two uncleared transactions (−£78.00 Supermarket, −£12.50 Coffee).

```
New computedBalance A = £4,702.20  (same as clearedBalance was before)
New clearedBalance A  = £4,702.20
```

Re-run forecast for 3, 6, 12 months with updated baseBalance. Assert:
- 3-month end balance = previous 3-month end balance + 78.00 + 12.50
- 6-month and 12-month balances adjust by the same offset (only baseBalance changed, no scheduled entries changed)

#### Section 6 — Modify/delete scheduled tasks → revisit forecasts

Step 6a: Change Gym amount from −£45.00 to −£50.00.
- Re-run 3-month forecast; balance decreases by (count of Mondays before 2026-06-07) × 5.00

Step 6b: Delete the Gym scheduled transaction entirely.
- Re-run 3-month forecast; balance increases by original Gym total across window
- Re-run 12-month forecast; Gym contributions beyond 2026-07-01 were already zero (rule ends), so the delta equals sum of Gym occurrences only up to 2026-07-01

Step 6c: Delete the Council Tax scheduled transaction.
- Re-run 12-month forecast; balance increases by sum of all Council Tax occurrences in the 12-month window (limited by the COUNT=10 rule)

---

## 4. Unit Tests (Pure Functions)

### `forecast.unit.test.ts`

`buildForecastRows` is pure. Tests use `vi.setSystemTime` and constructed arrays — no DB needed.

| Test | What is asserted |
|---|---|
| Empty transactions and no scheduled → single point at baseBalance | — |
| Single future real transaction adds to running balance on correct date | — |
| Single scheduled (monthly) expands correctly across 3-month window | count, dates, amounts |
| Exclusion toggle removes an entry from the running balance | balance difference |
| Negative balance is not clamped (full pass-through) | — |
| Scheduled that ends before window end contributes only within active range | — |
| Two accounts never bleed into each other | isolation |

### `balances.unit.test.ts` (after optional extraction)

Tests the running-balance memo logic (currently in `TransactionsTable.tsx`).

| Test | What is asserted |
|---|---|
| Correct per-row cumulative balance for known sorted transactions | exact per-row values |
| Transaction on same date sorted by id | deterministic ordering |
| Single transaction | opening + amount |

---

## 5. File Map

```
src/
  lib/
    forecast.ts                       ← extracted from ForecastPage.tsx (prerequisite)
    balances.ts                       ← extracted from TransactionsTable.tsx (optional)
  tests/
    integration/
      setup.ts                        ← vi.setSystemTime('2026-03-07') for all suites
      helpers/
        db.ts                         ← createTestDb()
        ipc.ts                        ← createMockIpc()
        fixtures.ts                   ← seed data + derived expected balances (documented)
      accounts.test.ts
      categories.test.ts
      transactions.test.ts
      scheduled.test.ts
      forecast.test.ts                ← sections 1-6 above
    unit/
      forecast.unit.test.ts
      balances.unit.test.ts
vitest.workspace.ts                   ← new: splits unit (happy-dom) vs integration (node)
```

Existing recurrence tests (`buildRRule.test.ts`, `DailySegment.test.tsx`, etc.) stay in place and are picked up by the `unit` project unchanged.

---

## 6. What Is Explicitly Out of Scope (for Now)

- **Reconciliation workflow** — explicitly deferred per the brief
- **React component rendering tests** beyond what already exists — the integration tests verify data correctness at the IPC/logic layer; component snapshot tests add little value here
- **E2E via Playwright/Spectron** — the mock-IPC approach covers the same scenarios without the overhead of booting an Electron process
- **`account-reconciliations.js` CRUD** — basic CRUD tests exist implicitly via the integration test DB helper; a dedicated suite is not required until the reconciliation workflow tests are added

---

## 7. Execution Order

1. Extract `buildForecastRows` → `src/lib/forecast.ts`
2. (Optional) Extract running-balance memo → `src/lib/balances.ts`
3. Add `vitest.workspace.ts` and adjust `vite.config.ts`
4. Write `helpers/` (`db.ts`, `ipc.ts`, `fixtures.ts`)
5. Write unit tests (`forecast.unit.test.ts`, `balances.unit.test.ts`)
6. Write `accounts.test.ts`
7. Write `categories.test.ts`
8. Write `transactions.test.ts`
9. Write `scheduled.test.ts`
10. Write `forecast.test.ts` sections 1 → 6 in order, verifying each section passes before adding the next
