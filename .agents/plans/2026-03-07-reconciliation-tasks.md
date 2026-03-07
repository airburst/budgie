# Reconciliation Feature — Task Checklist

**Plan:** `.agents/plans/2026-03-07-reconciliation.md`
**Branch:** implement from `main`

Complete phases in order. Run `bun run lint && bun run check-types` after every phase before moving on.

---

## Phase 1 — Schema & Migration

- [x] In `src/main/db/schema.ts`, add `reconciled: integer("reconciled", { mode: "boolean" }).notNull().default(false)` to the `transactions` table definition
- [x] Create `src/main/db/migrations/0003_transactions_reconciled.sql` with:
  ```sql
  ALTER TABLE `transactions` ADD COLUMN `reconciled` integer NOT NULL DEFAULT 0;
  ```
- [x] Add entry to `src/main/db/migrations/meta/_journal.json` for migration `0003`
- [x] Create `src/main/db/migrations/meta/0003_snapshot.json` — copy `0002_snapshot.json` and add the `reconciled` column to the `transactions` table entry
- [x] Smoke-test the migration: `rm -f test.db && sed '/^--> statement-breakpoint/d' src/main/db/migrations/0003_transactions_reconciled.sql | sqlite3 test.db && sqlite3 test.db ".schema transactions"`
  - Verify `reconciled` column is present in `.schema` output
- [x] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 2 — IPC: `transactions:reconcile` channel + type wiring

- [x] In `public/ipc/transactions.js`, add `inArray` to the `drizzle-orm` require at the top of the file
- [x] In `public/ipc/transactions.js`, add the `transactions:reconcile` handler (atomic DB transaction wrapping bulk status update + checkpoint insert). Guard both `toReconcile` and `toUnclear` arrays with a length check before calling `inArray`.
- [x] In `public/preload.js`, expose `reconcileTransactions: (payload) => ipcRenderer.invoke("transactions:reconcile", payload)` on `window.api`
- [x] In `src/types/electron.d.ts`, add `reconciled: boolean` to the `Transaction` type
- [x] In `src/types/electron.d.ts`, add `reconcileTransactions` to the `ElectronAPI` interface:
  ```ts
  reconcileTransactions: (payload: {
    toReconcile: number[];
    toUnclear: number[];
    checkpoint: Omit<AccountReconciliation, "id" | "createdAt">;
  }) => Promise<AccountReconciliation[]>;
  ```
- [x] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 3 — Rebuild `public/db.js`

- [x] Run `bun run vite build --config vite.main.config.ts`
- [x] Confirm build exits with no errors

---

## Phase 4 — ReconciliationDialog Rebuild

Full rewrite of `src/pages/AccountTransactions/ReconciliationDialog.tsx`. See plan for detailed spec.

- [x] Replace the file with a two-step dialog:
  - **Step 1 (Initiate):** statement date input + statement ending balance input. "Next" advances; "Cancel" closes and resets.
  - **Step 2 (Match):** transaction list filtered to `reconciled=false AND date <= statementDate`. Pre-check transactions where `cleared=true`. Split into Payments/Debits and Deposits/Credits columns. Running footer shows: Opening balance / Cleared balance (`openingBalance + sum of checked amounts`) / Statement balance / Difference. "Back" returns to Step 1; "Cancel" closes; "Finish" enabled only when `|difference| < 0.005`.
- [x] Opening balance = `account.lastReconcileBalance ?? account.balance`
- [x] On Finish: compute `toReconcile` (checked IDs) and `toUnclear` (pre-checked IDs that are now unchecked). Call `reconcile.mutateAsync(...)` from the hook.
- [x] Accept `reconcile` mutation as a prop or call `useTransactions(account.id)` internally — ensure query invalidation happens on success via the hook's `onSuccess`
- [x] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 5 — IPC: Immutability Guard on `transactions:update` and `transactions:delete`

- [x] In `public/ipc/transactions.js`, replace the `transactions:update` handler: add a preflight `SELECT` that reads `reconciled` for the target row; throw if `reconciled=true`
- [x] In `public/ipc/transactions.js`, replace the `transactions:delete` handler: same guard — throw if the row has `reconciled=true`
- [x] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 6 — TransactionsTable Updates

- [x] In `src/pages/AccountTransactions/TransactionsTable.tsx`, update the status column (currently a bare checkbox):
  - `tx.reconciled === true` → render a non-interactive `R` text/badge (no checkbox)
  - `tx.cleared && !tx.reconciled` → render a checked checkbox (existing)
  - `!tx.cleared` → render an unchecked checkbox (existing)
  - `onChange` fires only when `!tx.reconciled`
- [x] Disable Edit and Delete buttons when `tx.reconciled === true`; add a tooltip "Reconciled transactions cannot be edited"
  - NOTE: Base UI `TooltipTrigger` uses `render` prop for polymorphism, NOT `asChild`. Use: `<TooltipTrigger render={<span className="inline-flex items-center gap-1" />}>`
- [x] Guard row double-click (open edit sheet) against reconciled rows
- [x] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 7 — Wire Up Reconcile Button

- [x] In `src/pages/AccountTransactions/AccountTransactions.tsx`, import `ReconciliationDialog`
- [x] Add `reconcileOpen: boolean` state
- [x] Add a "Reconcile" button to the toolbar (next to "Forecast")
- [x] Render `<ReconciliationDialog>` — guard with `account !== undefined` before rendering
- [x] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 8 — useTransactions Hook

- [x] In `src/hooks/useTransactions.ts`, add a `reconcile` mutation:
  - `mutationFn`: calls `window.api.reconcileTransactions(payload)`
  - `onSuccess`: invalidates `["transactions", accountId]` and `["accounts"]`
- [x] Return `reconcile` from the hook
- [x] Update `ReconciliationDialog` if needed to consume `reconcile` from the hook rather than calling `window.api` directly
- [x] Run `bun run lint && bun run check-types` — must be clean

---

## Phase 9 — Integration Tests

- [x] In `src/tests/integration/helpers/ipc.ts`, add `require("../../../../public/ipc/account-reconciliations.js")(ipcMain, db, schema)` to `registerAllHandlers`
- [x] In `src/tests/integration/helpers/fixtures.ts`, add `RECONCILE_JAN` and `RECONCILE_FEB` fixtures (see plan for exact values)
- [x] Create `src/tests/integration/reconciliation.test.ts` with these 9 tests:
  - [x] `marks toReconcile transactions as cleared=true, reconciled=true`
  - [x] `reverts toUnclear transactions to cleared=false, reconciled=false`
  - [x] `computedBalance is unchanged after reconciliation`
  - [x] `clearedBalance is unchanged after reconciliation`
  - [x] `creates an account_reconciliation checkpoint with correct fields`
  - [x] `accounts:getById returns updated lastReconcileDate and lastReconcileBalance`
  - [x] `second reconciliation: lastReconcileBalance reflects first checkpoint`
  - [x] `all writes roll back if the checkpoint insert fails`
  - [x] `transactions:update throws on a reconciled transaction`
  - [x] `transactions:delete throws on a reconciled transaction`
  - [x] `no account_reconciliation record is created if reconcile is never invoked`
- [x] Run `bun run test` — all tests must pass
- [x] Run `bun run lint && bun run check-types` — must be clean

---

## Done

- [x] All 10 phases checked off
- [x] `bun run lint` exits clean
- [x] `bun run check-types` exits clean
- [x] `bun run test` exits clean (no regressions in existing tests)
