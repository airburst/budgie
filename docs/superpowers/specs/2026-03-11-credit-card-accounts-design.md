# Credit Card Accounts — Design Spec

**Date:** 2026-03-11

## Summary

Add credit card support to the accounts feature: two new nullable schema columns, conditional form fields, and remaining credit display in the accounts overview table.

---

## Sign Convention

Consistent across all account types:

- **Deposits / income** = positive
- **Withdrawals / expenses** = negative

For credit cards:

- Opening balance owed is user-entered as a positive number (e.g. `500`) but **negated on save** (stored as `-500`)
- `computedBalance` = negative = current debt
- **Remaining credit** = `creditLimit + computedBalance`

---

## Schema

Add two nullable columns to `accounts`:

```sql
ALTER TABLE `accounts` ADD COLUMN `interest_rate` REAL;
ALTER TABLE `accounts` ADD COLUMN `credit_limit` REAL;
```

Manual migration file: `0008_credit_card_fields.sql`

In `schema.ts`:

```ts
interestRate: real("interest_rate"),
creditLimit: real("credit_limit"),
```

Since `Account = InferSelectModel<typeof accounts>`, both fields appear automatically in `Account` and propagate to `AccountWithBalances`.

---

## Form (`AccountForm.tsx`)

1. **Balance label**: `"Opening Balance"` → `"Initial balance owed"` when `type === "credit_card"`
2. **Balance negation**: on save, negate balance for credit card accounts:
   ```ts
   balance: form.type === "credit_card"
     ? -(parseFloat(form.balance) || 0)
     : parseFloat(form.balance) || 0;
   ```
3. **Conditional fields** (shown only when `type === "credit_card"`):
   - Interest Rate (%) — number input, step 0.01
   - Credit Limit — number input, step 0.01
4. **Account type select**: display labels already capitalised (`"Credit Card"`, `"Bank"`, etc.) — no change needed

---

## Accounts Table (`AccountsTable.tsx`)

Populate the existing empty "Remaining Credit" cell:

```tsx
<TableCell className="text-right">
  {account.type === "credit_card" && account.creditLimit != null ? (
    <Amount value={account.creditLimit + account.computedBalance} />
  ) : null}
</TableCell>
```

---

## IPC / Backend

No changes required. `accounts.js` handler returns all columns via `db.select().from(schema.accounts)` — new columns are included automatically once schema and migration are applied.

---

## Migration Checklist

1. Write `0008_credit_card_fields.sql`
2. Add entry to `meta/_journal.json`
3. Update `meta/0008_snapshot.json`
4. Rebuild `public/db.js` (`bun run vite build --config vite.main.config.ts`)
5. Test: `rm -f test.db && sed '/^--> statement-breakpoint/d' ... | sqlite3 test.db`

---

## Files Changed

| File                                                 | Change                                    |
| ---------------------------------------------------- | ----------------------------------------- |
| `src/main/db/schema.ts`                              | Add `interestRate`, `creditLimit` columns |
| `src/main/db/migrations/0008_credit_card_fields.sql` | `ALTER TABLE` migration                   |
| `src/main/db/migrations/meta/_journal.json`          | Add entry                                 |
| `src/main/db/migrations/meta/0008_snapshot.json`     | New snapshot                              |
| `public/db.js`                                       | Rebuild output                            |
| `src/pages/Home/AccountForm.tsx`                     | Conditional fields, label, save logic     |
| `src/pages/Home/AccountsTable.tsx`                   | Populate remaining credit cell            |
