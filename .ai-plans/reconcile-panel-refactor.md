# Reconcile Panel Refactor

## Context

ReconciliationDialog currently handles both data collection AND transaction matching in a cramped dialog. Splitting into: (1) a slim dialog for date/balance entry, (2) a full-page reconcile panel for transaction matching. This gives more screen real estate and enables adding/editing transactions inline.

## Files to Modify

| File                                                     | Action                             |
| -------------------------------------------------------- | ---------------------------------- |
| `src/pages/AccountTransactions/ReconciliationDialog.tsx` | Strip to initiate-only             |
| `src/pages/Reconcile/ReconcilePage.tsx`                  | **New** — full-page reconcile view |
| `src/App.tsx`                                            | Add `/reconcile/:id` route         |

## Step 1: Simplify ReconciliationDialog

- Remove: `Step` type, `match` step, `TxRow`, `checkedIds`, `originallyCleared`, debit/credit split, balance computations, `fmt` helper
- Init `statementDate` as `new Date().toISOString().slice(0, 10)` (today)
- On "Next": close dialog, `navigate(/reconcile/${account.id}?date=${statementDate}&balance=${parsedBalance})`
- Use `useNavigate()` directly inside dialog
- Result: ~60 lines, dialog only collects date + balance

## Step 2: Create ReconcilePage

**File:** `src/pages/Reconcile/ReconcilePage.tsx`

Template: `ForecastPage.tsx` layout pattern (full page, back button, fixed bottom toolbar).

**Layout:**

```
Layout > div.flex.flex-col.h-full.overflow-y-auto.pb-20
  Header: back button + account name + "Add Transaction" button
  Balance summary bar (opening | cleared | statement | difference)
  Transaction table with checkboxes
  TransactionForm sheet (reuse existing component for add/edit)
  Fixed bottom toolbar: Cancel | Finish
```

**Params:** `:id` from path, `date` + `balance` from `useSearchParams()`. Redirect back if invalid.

**Data:** `useTransactions(accountId)`, `useAccounts()` — no new hooks or IPC needed.

**State:**

- `checkedIds: Set<number>` — init from already-cleared transactions (once)
- `originallyCleared: Set<number>` — snapshot at init for computing `toUnclear`
- `sheetOpen` + `editingId` for TransactionForm

**Computed:**

- `openingBalance` = `account.lastReconcileBalance ?? account.balance`
- `eligibleTransactions` = `transactions.filter(t => !t.reconciled && t.date <= statementDate)`
- `clearedBalance` = `openingBalance + sum(checked eligible amounts)`
- `difference` = `statementBalance - clearedBalance`
- `isBalanced` = `Math.abs(difference) < 0.005`

**Balance summary bar:** Horizontal row of stat cards above table showing Opening Balance, Cleared Balance, Statement Balance, Difference (green/red).

**Transaction table:** shadcn Table — columns: Checkbox, Date, Payee, Withdrawal, Deposit, Category, Notes. Pre-check cleared txns. Edit via TransactionForm sheet.

**Add Transaction:** Opens TransactionForm with date defaulting to statement date.

**Cancel:** Navigate back immediately, no confirmation prompt.

**Finish:** Same logic as current `handleFinish` — call `reconcile.mutateAsync()`, navigate to `/accounts/${accountId}`.

## Step 3: Add Route

```tsx
// App.tsx
const ReconcilePage = lazy(() => import("@/pages/Reconcile/ReconcilePage"));
<Route path="/reconcile/:id" element={<ReconcilePage />} />;
```

## Verification

1. Open an account, click Reconcile → dialog shows with today's date pre-filled
2. Enter balance, click Next → navigates to `/reconcile/:id?date=...&balance=...`
3. Reconcile page shows eligible transactions with cleared ones pre-checked
4. Check/uncheck transactions, balance summary updates live
5. Add a missing transaction via "+ Add Transaction" → appears in list
6. When difference = 0, Finish becomes enabled → click → reconciles and returns to account
7. `bun run lint && bun run check-types` pass
8. `bun run test` — existing reconciliation tests pass

## Decisions

- "Add Transaction" defaults date to statement date
- Cancel navigates back with no confirmation prompt
