# Reconciliation Feature — Task Checklist

**Plan:** `.agents/plans/2026-03-07-reconciliation.md`
**Branch:** implement from `main`

Complete phases in order. Run `bun run lint && bun run check-types` after every phase before moving on.

---

## Phase 1 — Schema & Migration

- [ ] In `src/main/db/schema.ts`, add `reconciled: integer("reconciled", { mode: "boolean" }).notNull().default(false)` to the `transactions` table definition
- [ ] Create `src/main/db/migrations/0003_transactions_reconciled.sql` with:
  ```sql
  ALTER TABLE `transactions` ADD COLUMN `reconciled` integer NOT NULL DEFAULT 0;
  ```
- [ ] Add entry to `src/main/db/migrations/meta/_journal.json` for migration `0003`
- [ ] Create `src/main/db/migrations/meta/0003_snapshot.json` — copy `0002_snapshot.json` and add the `reconciled` column to the `transactions` table entry
- [ ] Smoke-test the migration: `rm -f test.db && sed '/^--> statement-breakpoint/d' src/main/db/migrations/0003_transactions_reconciled.sql | sqlite3 test.db && sqlite3 test.db ".schema transactions"`
  - Verify `reconciled` column is present in `.schema` output
- [ ] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 2 — IPC: `transactions:reconcile` channel + type wiring

- [ ] In `public/ipc/transactions.js`, add `inArray` to the `drizzle-orm` require at the top of the file
- [ ] In `public/ipc/transactions.js`, add the `transactions:reconcile` handler (atomic DB transaction wrapping bulk status update + checkpoint insert). Guard both `toReconcile` and `toUnclear` arrays with a length check before calling `inArray`.
- [ ] In `public/preload.js`, expose `reconcileTransactions: (payload) => ipcRenderer.invoke("transactions:reconcile", payload)` on `window.api`
- [ ] In `src/types/electron.d.ts`, add `reconciled: boolean` to the `Transaction` type
- [ ] In `src/types/electron.d.ts`, add `reconcileTransactions` to the `ElectronAPI` interface:
  ```ts
  reconcileTransactions: (payload: {
    toReconcile: number[];
    toUnclear: number[];
    checkpoint: Omit<AccountReconciliation, "id" | "createdAt">;
  }) => Promise<AccountReconciliation[]>;
  ```
- [ ] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 3 — Rebuild `public/db.js`

- [ ] Run `bun run vite build --config vite.main.config.ts`
- [ ] Confirm build exits with no errors

---

## Phase 4 — ReconciliationDialog Rebuild

Full rewrite of `src/pages/AccountTransactions/ReconciliationDialog.tsx`. See plan for detailed spec.

- [ ] Replace the file with a two-step dialog:
  - **Step 1 (Initiate):** statement date input + statement ending balance input. "Next" advances; "Cancel" closes and resets.
  - **Step 2 (Match):** transaction list filtered to `reconciled=false AND date <= statementDate`. Pre-check transactions where `cleared=true`. Split into Payments/Debits and Deposits/Credits columns. Running footer shows: Opening balance / Cleared balance (`openingBalance + sum of checked amounts`) / Statement balance / Difference. "Back" returns to Step 1; "Cancel" closes; "Finish" enabled only when `|difference| < 0.005`.
- [ ] Opening balance = `account.lastReconcileBalance ?? account.balance`
- [ ] On Finish: compute `toReconcile` (checked IDs) and `toUnclear` (pre-checked IDs that are now unchecked). Call `reconcile.mutateAsync(...)` from the hook.
- [ ] Accept `reconcile` mutation as a prop or call `useTransactions(account.id)` internally — ensure query invalidation happens on success via the hook's `onSuccess`
- [ ] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 5 — IPC: Immutability Guard on `transactions:update` and `transactions:delete`

- [ ] In `public/ipc/transactions.js`, replace the `transactions:update` handler: add a preflight `SELECT` that reads `reconciled` for the target row; throw if `reconciled=true`
- [ ] In `public/ipc/transactions.js`, replace the `transactions:delete` handler: same guard — throw if the row has `reconciled=true`
- [ ] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 6 — TransactionsTable Updates

- [ ] In `src/pages/AccountTransactions/TransactionsTable.tsx`, update the status column (currently a bare checkbox):
  - `tx.reconciled === true` → render a non-interactive `R` text/badge (no checkbox)
  - `tx.cleared && !tx.reconciled` → render a checked checkbox (existing)
  - `!tx.cleared` → render an unchecked checkbox (existing)
  - `onChange` fires only when `!tx.reconciled`
- [ ] Disable Edit and Delete buttons when `tx.reconciled === true`; add a tooltip "Reconciled transactions cannot be edited"
- [ ] Guard row double-click (open edit sheet) against reconciled rows
- [ ] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 7 — Wire Up Reconcile Button

- [ ] In `src/pages/AccountTransactions/AccountTransactions.tsx`, import `ReconciliationDialog`
- [ ] Add `reconcileOpen: boolean` state
- [ ] Add a "Reconcile" button to the toolbar (next to "Forecast")
- [ ] Render `<ReconciliationDialog>` — guard with `account !== undefined` before rendering
- [ ] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 8 — useTransactions Hook

- [ ] In `src/hooks/useTransactions.ts`, add a `reconcile` mutation:
  - `mutationFn`: calls `window.api.reconcileTransactions(payload)`
  - `onSuccess`: invalidates `["transactions", accountId]` and `["accounts"]`
- [ ] Return `reconcile` from the hook
- [ ] Update `ReconciliationDialog` if needed to consume `reconcile` from the hook rather than calling `window.api` directly
- [ ] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 9 — Integration Tests

- [ ] In `src/tests/integration/helpers/ipc.ts`, add `require("../../../../public/ipc/account-reconciliations.js")(ipcMain, db, schema)` to `registerAllHandlers`
- [ ] In `src/tests/integration/helpers/fixtures.ts`, add `RECONCILE_JAN` and `RECONCILE_FEB` fixtures (see plan for exact values)
- [ ] Create `src/tests/integration/reconciliation.test.ts` with these 9 tests:
  - [ ] `marks toReconcile transactions as cleared=true, reconciled=true`
  - [ ] `reverts toUnclear transactions to cleared=false, reconciled=false`
  - [ ] `computedBalance is unchanged after reconciliation`
  - [ ] `clearedBalance is unchanged after reconciliation`
  - [ ] `creates an account_reconciliation checkpoint with correct fields`
  - [ ] `accounts:getById returns updated lastReconcileDate and lastReconcileBalance`
  - [ ] `second reconciliation: lastReconcileBalance reflects first checkpoint`
  - [ ] `all writes roll back if the checkpoint insert fails`
  - [ ] `transactions:update throws on a reconciled transaction`
  - [ ] `transactions:delete throws on a reconciled transaction`
  - [ ] `no account_reconciliation record is created if reconcile is never invoked`
- [ ] Run `bun run test` — all tests must pass
- [ ] Run `bun run lint && bun run check-types` — must be clean

---

## Done

- [ ] All 10 phases checked off
- [ ] `bun run lint` exits clean
- [ ] `bun run check-types` exits clean
- [ ] `bun run test` exits clean (no regressions in existing tests)
