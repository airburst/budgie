# Reconciliation Feature Plan

**Date:** 2026-03-07
**Status:** Planning

## Decisions

| Question                   | Answer                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| Transaction status storage | Add `reconciled boolean` column to `transactions` (additive; `reconciled=true` implies `cleared=true`) |
| Dialog workflow            | Full Quicken-style: transaction list inside dialog with live Difference counter                        |
| Locking                    | Hard lock — disable edit/delete buttons on reconciled transactions, show `R` badge                     |
| Date filtering in dialog   | Show only unreconciled transactions with `date <= statementDate`; users change transaction dates to include later ones |
| Atomicity                  | `transactions:reconcile` IPC handler wraps all writes in a single DB transaction (required)            |
| Opening balance            | Accounts are always created with an opening balance, so `account.lastReconcileBalance ?? account.balance` is always a valid number |

---

## Background & Current State

The schema already has:

- `transactions.cleared` (boolean) — user marks transactions as cleared in the register
- `account_reconciliations` table — stores checkpoints (date + balance per account)
- `AccountWithBalances.lastReconcileDate` / `lastReconcileBalance` — computed in `accounts.js` via a subquery on `account_reconciliations`

`ReconciliationDialog.tsx` exists but is **not yet wired into** `AccountTransactions.tsx` (no Reconcile button in the page). The existing dialog is a simple checkpoint form; it will be rebuilt.

The `clearedBalance` in `accounts.js` is computed as `account.balance + SUM(amount) WHERE cleared = true`. Because the new model will always set `cleared=true` when `reconciled=true`, this computation continues to work without change.

---

## State Machine

```
uncleared  ──► cleared ──► reconciled
  cleared=false    cleared=true     cleared=true
  reconciled=false reconciled=false reconciled=true

User can toggle uncleared ↔ cleared in the register at any time.
Reconciled is terminal — no UI toggle back (hard locked).
```

---

## Implementation Phases

### Phase 1 — Schema & Migration

**File:** `src/main/db/schema.ts`

Add to the `transactions` table:

```ts
reconciled: integer("reconciled", { mode: "boolean" }).notNull().default(false),
```

**Migration:** Write `src/main/db/migrations/0003_transactions_reconciled.sql` manually:

```sql
ALTER TABLE `transactions` ADD COLUMN `reconciled` integer NOT NULL DEFAULT 0;
```

Then:

1. Add entry to `src/main/db/migrations/meta/_journal.json`
2. Update `src/main/db/migrations/meta/0003_snapshot.json` to reflect new schema state
3. Smoke-test: `rm -f test.db && sqlite3 test.db < src/main/db/migrations/0003_transactions_reconciled.sql`
4. Rebuild: `bun run vite build --config vite.main.config.ts`

---

### Phase 2 — New IPC Channel: `transactions:reconcile`

The reconciliation finish action is a multi-row, multi-table write that must be atomic. A dedicated channel avoids N individual `transactions:update` round-trips and ensures consistency.

**File:** `public/ipc/transactions.js` — add one new handler inside the existing module:

```js
ipcMain.handle(
  "transactions:reconcile",
  (_, { toReconcile, toUnclear, checkpoint }) => {
    return db.transaction(() => {
      // Mark checked transactions as cleared + reconciled
      if (toReconcile.length > 0) {
        db.update(schema.transactions)
          .set({ cleared: true, reconciled: true })
          .where(inArray(schema.transactions.id, toReconcile))
          .run();
      }
      // Transactions the user unchecked that were previously cleared → revert to uncleared
      if (toUnclear.length > 0) {
        db.update(schema.transactions)
          .set({ cleared: false, reconciled: false })
          .where(inArray(schema.transactions.id, toUnclear))
          .run();
      }
      // Save reconciliation checkpoint
      return db
        .insert(schema.accountReconciliations)
        .values(checkpoint)
        .returning();
    });
  },
);
```

Note: Drizzle's `inArray` needs to be imported from `drizzle-orm`. Guard both arrays against being empty before calling — `inArray(col, [])` produces invalid SQL in some Drizzle versions. The better-sqlite3 driver executes synchronously, so `db.transaction()` works without async/await.

**`public/preload.js`** — expose:

```js
reconcileTransactions: (payload) => ipcRenderer.invoke("transactions:reconcile", payload),
```

**`src/types/electron.d.ts`** — extend `Transaction` type and `ElectronAPI`:

```ts
// In Transaction type (add field):
reconciled: boolean;

// In ElectronAPI:
reconcileTransactions: (payload: {
  toReconcile: number[];
  toUnclear: number[];
  checkpoint: Omit<AccountReconciliation, "id" | "createdAt">;
}) => Promise<AccountReconciliation[]>;
```

---

### Phase 3 — Rebuild `public/db.js`

```
bun run vite build --config vite.main.config.ts
```

Run after Phase 1 and Phase 2 changes to `src/main/db/schema.ts`.

---

### Phase 4 — ReconciliationDialog Rebuild

**File:** `src/pages/AccountTransactions/ReconciliationDialog.tsx`

Full rewrite. The dialog becomes a two-step flow rendered inside a single `Dialog`.

#### Step 1 — Initiate

Shown first. User enters:

- **Statement date** (date input)
- **Statement ending balance** (number input)

"Next" button advances to Step 2. "Cancel" closes.

#### Step 2 — Match

State managed in the dialog:

- `checkedIds: Set<number>` — initially populated with IDs of `cleared=true AND reconciled=false` transactions (already cleared in register).
- `openingBalance: number` — `account.lastReconcileBalance ?? account.balance`. Accounts are always created with an opening balance, so this is always a valid number. On first-ever reconciliation, `lastReconcileBalance` is `null` and the account opening balance is used.

Display:

- Two-column table layout (or single table with type column):
  - **Payments & Debits** (amount < 0)
  - **Deposits & Credits** (amount > 0)
- Each row: checkbox | date | payee | amount
- Only unreconciled transactions shown where `date <= statementDate` and `reconciled=false`
  - Transactions dated after the statement date are excluded; users must change the transaction date to include them
- Pre-check any that are already `cleared=true`

Running totals footer:

```
Opening balance:   £X,XXX.XX  (lastReconcileBalance or account.balance)
Cleared balance:   £X,XXX.XX  (openingBalance + sum of checked amounts)
Statement balance: £X,XXX.XX  (user-entered)
Difference:        £   0.00   ✓ / shown in red if non-zero
```

Buttons:

- **Back** → return to Step 1
- **Cancel** → close, discard
- **Finish** — enabled only when `|difference| < 0.005`

#### On Finish

Compute:

- `toReconcile` = IDs of checked transactions
- `toUnclear` = IDs of transactions that were pre-checked (originally `cleared=true`) but are now unchecked by the user (user is saying "this hasn't cleared yet")

Call `window.api.reconcileTransactions({ toReconcile, toUnclear, checkpoint: { accountId, date: statementDate, balance: parsedBalance, notes: null } })`.

Invalidate `["transactions", accountId]` and `["accounts"]` queries on success.

---

### Phase 5 — IPC-Level Immutability Guard

**File:** `public/ipc/transactions.js`

Add guards to `transactions:update` and `transactions:delete` that reject operations on reconciled transactions. These are needed so that the immutability invariant is enforced at the data layer, not just the UI — and so integration tests can exercise it directly.

```js
ipcMain.handle("transactions:update", async (_, id, data) => {
  const existing = await db
    .select({ reconciled: schema.transactions.reconciled })
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .then((r) => r[0] ?? null);
  if (!existing) return [];
  if (existing.reconciled) {
    throw new Error(`Transaction ${id} is reconciled and cannot be modified.`);
  }
  return db
    .update(schema.transactions)
    .set(data)
    .where(eq(schema.transactions.id, id))
    .returning();
});

ipcMain.handle("transactions:delete", async (_, id) => {
  const existing = await db
    .select({ reconciled: schema.transactions.reconciled })
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .then((r) => r[0] ?? null);
  if (existing?.reconciled) {
    throw new Error(`Transaction ${id} is reconciled and cannot be deleted.`);
  }
  return db.delete(schema.transactions).where(eq(schema.transactions.id, id));
});
```

Note: These handlers replace the existing implementations. The extra preflight `SELECT` is negligible for a local SQLite app.

---

### Phase 6 — TransactionsTable Updates

**File:** `src/pages/AccountTransactions/TransactionsTable.tsx`

1. **Status column** (currently the bare `<input type="checkbox">` "C" column):
   - If `tx.reconciled`: render an `R` badge (or text) — no checkbox, not interactive
   - If `tx.cleared && !tx.reconciled`: render a checked checkbox (existing behaviour)
   - If `!tx.cleared`: render an unchecked checkbox (existing behaviour)
   - The `onChange` handler for the checkbox must only fire when `!tx.reconciled`

2. **Edit/Delete buttons**: When `tx.reconciled === true`, disable both buttons and add a tooltip: "Reconciled transactions cannot be edited."

3. **Row double-click** to open edit sheet: guard against reconciled rows.

4. **Column header**: Change label from `C` to `Status` or keep `C/R` — minor cosmetic decision.

---

### Phase 7 — Wire Up Reconcile Button

**File:** `src/pages/AccountTransactions/AccountTransactions.tsx`

1. Import `ReconciliationDialog`
2. Add `reconcileOpen` state
3. Add a "Reconcile" button to the toolbar (next to "Forecast"):
   ```tsx
   <Button variant="outline" size="sm" onClick={() => setReconcileOpen(true)}>
     <CheckSquareIcon />
     Reconcile
   </Button>
   ```
4. Render `<ReconciliationDialog>` with `account={account}` (guard: only render when account is loaded)

---

### Phase 8 — useTransactions Hook

**File:** `src/hooks/useTransactions.ts`

Add a `reconcile` mutation:

```ts
const reconcile = useMutation({
  mutationFn: (payload: { toReconcile: number[]; toUnclear: number[]; checkpoint: ... }) =>
    window.api.reconcileTransactions(payload),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["transactions", accountId] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  },
});
```

Return `reconcile` from the hook. The `ReconciliationDialog` can use this rather than calling `window.api` directly.

---

### Phase 9 — Integration Tests

New file: `src/tests/integration/reconciliation.test.ts`

Uses the same `createTestDb` / `createMockIpc` / `registerAllHandlers` helpers as the existing integration tests. `registerAllHandlers` will also need `account-reconciliations.js` added to it so the checkpoints created during reconciliation are queryable.

#### Fixtures needed

Add to `src/tests/integration/helpers/fixtures.ts`:

```ts
// Reconciliation statement dates that align with the existing TRANSACTIONS_A fixture:
//   Jan statement covers Jan transactions (Salary Jan, Groceries)
//   Feb statement covers Jan + Feb transactions (+ Salary Feb, Rent, Utilities)
export const RECONCILE_JAN = {
  date: "2026-01-31",
  // openingBalance = account.balance (1000) + Salary Jan (2500) - Groceries (250) = 3250
  balance: 3250,
};
export const RECONCILE_FEB = {
  date: "2026-02-28",
  // openingBalance = 3250 + Salary Feb (2500) - Rent (500) - Utilities (547.80) = 4702.20
  balance: 4702.2,
};
```

#### Test cases

```
describe("transactions:reconcile IPC", () => {

  // ── Happy-path reconciliation ──────────────────────────────────────────────

  it("marks toReconcile transactions as cleared=true, reconciled=true")
  // Invoke reconcile with January transaction ids.
  // Fetch each via transactions:getById, assert cleared=true, reconciled=true.

  it("reverts toUnclear transactions to cleared=false, reconciled=false")
  // Include a previously-cleared transaction in toUnclear.
  // After reconcile, assert cleared=false, reconciled=false.

  it("computedBalance is unchanged after reconciliation")
  // Record computedBalance before reconcile via accounts:getById.
  // Invoke reconcile (status change only, no amounts change).
  // Assert computedBalance after == computedBalance before.

  it("clearedBalance is unchanged after reconciliation")
  // Same as above but for clearedBalance.
  // Explanation: toReconcile transitions cleared→reconciled (both set cleared=true),
  // and toUnclear transitions cleared→uncleared (clears cleared=true).
  // Net effect on clearedBalance depends on which transactions moved, so
  // test a reconcile where toUnclear is empty to confirm no balance drift.

  it("creates an account_reconciliation checkpoint with correct fields")
  // Invoke account_reconciliations:getByAccount after reconcile.
  // Assert one record with matching accountId, date, balance.

  it("accounts:getById returns updated lastReconcileDate and lastReconcileBalance")
  // After reconcile, invoke accounts:getById.
  // Assert lastReconcileDate == checkpoint.date.
  // Assert lastReconcileBalance ≈ checkpoint.balance.

  it("second reconciliation: lastReconcileBalance reflects first checkpoint")
  // Perform Jan reconcile, then Feb reconcile.
  // After Feb, assert lastReconcileBalance ≈ RECONCILE_FEB.balance
  // and the account_reconciliations table has two rows.

  // ── Atomicity ──────────────────────────────────────────────────────────────

  it("all writes roll back if the checkpoint insert fails")
  // Pass a checkpoint with a non-existent accountId (FK violation).
  // Assert the invoke rejects.
  // Fetch the transactions that were in toReconcile — assert still reconciled=false.

  // ── Immutability guard ─────────────────────────────────────────────────────

  it("transactions:update throws on a reconciled transaction")
  // Reconcile a transaction, then attempt transactions:update on its id.
  // Assert the invoke rejects with an error.
  // Fetch the transaction, assert fields are unchanged.

  it("transactions:delete throws on a reconciled transaction")
  // Reconcile a transaction, then attempt transactions:delete on its id.
  // Assert the invoke rejects.
  // Fetch by account, assert the row still exists.

  // ── Cancel / no-op ────────────────────────────────────────────────────────

  it("no account_reconciliation record is created if reconcile is never invoked")
  // Open description: this documents that cancel (not calling the IPC) leaves
  // state untouched. Implemented as: create account, add transactions, do NOT
  // call transactions:reconcile, assert account_reconciliations:getByAccount
  // returns []. Trivial but serves as a regression guard.
})
```

#### What is NOT covered by integration tests (by design)

| Scenario | Why | How to test instead |
|---|---|---|
| Finish button disabled when difference ≠ 0 | UI constraint only; IPC handler trusts the client | React component test / manual |
| Cancel button discards dialog state | No IPC called; purely component state | React component test |
| Date filter in match step hides future transactions | Filtering done in React, not in the IPC | React component test |
| `R` badge and disabled buttons render correctly | Rendering details | React component test |

---

### Phase 10 — Lint & Type Check

```
bun run lint
bun run check-types
```

Both must exit cleanly before the task is considered done.

---

## File Change Summary

| File                                                      | Change                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/main/db/schema.ts`                                   | Add `reconciled` boolean to `transactions`                                      |
| `src/main/db/migrations/0003_transactions_reconciled.sql` | New — ALTER TABLE ADD COLUMN                                                    |
| `src/main/db/migrations/meta/_journal.json`               | Add entry for migration 0003                                                    |
| `src/main/db/migrations/meta/0003_snapshot.json`          | New snapshot reflecting updated schema                                          |
| `public/db.js`                                            | Rebuilt artifact (do not edit manually)                                         |
| `public/ipc/transactions.js`                              | Add `transactions:reconcile` handler; add reconciled guard to update + delete   |
| `public/preload.js`                                       | Expose `reconcileTransactions` on `window.api`                                  |
| `public/electron.js`                                      | No change needed (handler added inside existing file)                           |
| `src/types/electron.d.ts`                                 | Add `reconciled` to `Transaction`; add `reconcileTransactions` to `ElectronAPI` |
| `src/hooks/useTransactions.ts`                            | Add `reconcile` mutation                                                        |
| `src/pages/AccountTransactions/ReconciliationDialog.tsx`  | Full rewrite — two-step Quicken-style dialog                                    |
| `src/pages/AccountTransactions/TransactionsTable.tsx`     | Status column shows R/c/unchecked; lock reconciled rows                         |
| `src/pages/AccountTransactions/AccountTransactions.tsx`   | Add Reconcile button + wire dialog                                              |
| `src/tests/integration/helpers/ipc.ts`                    | Add `account-reconciliations.js` to `registerAllHandlers`                       |
| `src/tests/integration/helpers/fixtures.ts`               | Add `RECONCILE_JAN`, `RECONCILE_FEB` checkpoint fixtures                        |
| `src/tests/integration/reconciliation.test.ts`            | New — 9 integration test cases (see Phase 9)                                    |

---

## Remaining Implementation Risk

- **`inArray` with empty arrays**: If both `toReconcile` and `toUnclear` are empty (user opened the dialog, checked nothing, and clicked Finish — which shouldn't be reachable since Finish is only enabled when difference = 0 and at least one transaction must be checked to get there), `inArray(col, [])` could produce invalid SQL. Guard both arrays with an early-return / length check before executing the update.
