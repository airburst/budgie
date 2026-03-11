# Credit Card Accounts Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add credit card account support with `interest_rate`/`credit_limit` columns, conditional form fields, and remaining credit display in the accounts table.

**Architecture:** Manual SQL migration adds two nullable `REAL` columns to `accounts`. The `withBalances` query in `accounts.js` is extended to expose them. The UI form shows credit-specific fields conditionally and negates the opening balance on save. The accounts table populates the pre-existing "Remaining Credit" cell for credit card accounts.

**Tech Stack:** SQLite (drizzle-orm), Electron IPC (CommonJS), React + TypeScript, shadcn/ui

---

## Chunk 1: Schema, Migration, and Backend

### Task 1: Write the SQL migration

**Files:**

- Create: `src/main/db/migrations/0008_credit_card_fields.sql`

- [ ] Create the file with:

```sql
ALTER TABLE `accounts` ADD COLUMN `interest_rate` REAL;
--> statement-breakpoint
ALTER TABLE `accounts` ADD COLUMN `credit_limit` REAL;
```

- [ ] Verify no DROP TABLE in the file.

- [ ] Test the migration against a fresh DB:

```bash
rm -f test.db
sed '/^--> statement-breakpoint/d' src/main/db/migrations/0008_credit_card_fields.sql | sqlite3 test.db
sqlite3 test.db ".schema accounts"
```

Expected output includes `interest_rate` and `credit_limit` columns:

```
CREATE TABLE accounts (..., interest_rate REAL, credit_limit REAL)
```

---

### Task 2: Update `_journal.json`

**Files:**

- Modify: `src/main/db/migrations/meta/_journal.json`

- [ ] Add entry at end of `entries` array:

```json
{
  "idx": 8,
  "version": "6",
  "when": 1741996800000,
  "tag": "0008_credit_card_fields",
  "breakpoints": true
}
```

---

### Task 3: Write snapshot `0008_snapshot.json`

**Files:**

- Create: `src/main/db/migrations/meta/0008_snapshot.json`

- [ ] Copy `0007_snapshot.json` as the base, then:
  - Change `"id"` to `"d4e5f6a7-b8c9-0123-defa-234567890123"`
  - Change `"prevId"` to `"c3d4e5f6-a7b8-9012-cdef-123456789012"` (the 0007 id)
  - In `tables.accounts.columns`, add after `"notes"`:

```json
"interest_rate": {
  "name": "interest_rate",
  "type": "real",
  "primaryKey": false,
  "notNull": false,
  "autoincrement": false
},
"credit_limit": {
  "name": "credit_limit",
  "type": "real",
  "primaryKey": false,
  "notNull": false,
  "autoincrement": false
},
```

---

### Task 4: Update `schema.ts`

**Files:**

- Modify: `src/main/db/schema.ts`

- [ ] Add two nullable columns to the `accounts` table definition, after `notes`:

```ts
interestRate: real("interest_rate"),
creditLimit: real("credit_limit"),
```

---

### Task 5: Update `withBalances` in `accounts.js`

**Files:**

- Modify: `public/ipc/accounts.js`

- [ ] The `withBalances` select explicitly lists fields. Add `interestRate` and `creditLimit` to the select object, after `notes`:

```js
interestRate: schema.accounts.interestRate,
creditLimit: schema.accounts.creditLimit,
```

---

### Task 6: Rebuild `public/db.js`

- [ ] Run:

```bash
bun run vite build --config vite.main.config.ts
```

Expected: build completes with no errors.

---

### Task 7: Run tests

- [ ] Run:

```bash
bun run lint && bun run check-types && bun run test
```

Expected: all pass with zero errors.

- [ ] Commit:

```bash
git add src/main/db/schema.ts \
        src/main/db/migrations/0008_credit_card_fields.sql \
        src/main/db/migrations/meta/_journal.json \
        src/main/db/migrations/meta/0008_snapshot.json \
        public/db.js \
        public/ipc/accounts.js
git commit -m "feat: add interest_rate and credit_limit columns to accounts"
```

---

## Chunk 2: Form UI

### Task 8: Update `AccountForm.tsx`

**Files:**

- Modify: `src/pages/Home/AccountForm.tsx`

Three changes:

**A) Extend empty state** — add `interestRate` and `creditLimit`:

```ts
const empty = {
  name: "",
  number: "",
  type: "bank" as const,
  balance: "0",
  currency: "GBP",
  notes: "",
  interestRate: "",
  creditLimit: "",
};
```

**B) Update `save()` to negate balance for credit cards and pass new fields:**

```ts
async function save() {
  const isCreditCard = form.type === "credit_card";
  await create.mutateAsync({
    name: form.name,
    number: form.number || null,
    type: form.type as "bank" | "credit_card" | "loan" | "investment" | "cash",
    balance: isCreditCard
      ? -(parseFloat(form.balance) || 0)
      : parseFloat(form.balance) || 0,
    currency: form.currency || "GBP",
    notes: form.notes || null,
    interestRate: form.interestRate ? parseFloat(form.interestRate) : null,
    creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : null,
  });
  handleClose();
}
```

**C) Update the form JSX:**

Replace the existing "Opening Balance" label:

```tsx
<Label htmlFor="acc-balance">
  {form.type === "credit_card" ? "Initial balance owed" : "Opening Balance"}
</Label>
```

Add conditional fields directly after the balance field (before the currency field):

```tsx
{
  form.type === "credit_card" && (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="acc-credit-limit">Credit Limit</Label>
        <Input
          id="acc-credit-limit"
          type="number"
          step="0.01"
          placeholder="e.g. 5000"
          value={form.creditLimit}
          onChange={(e) => set("creditLimit", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="acc-interest-rate">Interest Rate (%)</Label>
        <Input
          id="acc-interest-rate"
          type="number"
          step="0.01"
          placeholder="e.g. 19.9"
          value={form.interestRate}
          onChange={(e) => set("interestRate", e.target.value)}
        />
      </div>
    </>
  );
}
```

- [ ] Apply all three changes to `AccountForm.tsx`.

- [ ] Run:

```bash
bun run lint && bun run check-types
```

Expected: zero errors.

- [ ] Commit:

```bash
git add src/pages/Home/AccountForm.tsx
git commit -m "feat: credit card fields and balance negation in AccountForm"
```

---

## Chunk 3: Accounts Table

### Task 9: Populate remaining credit in `AccountsTable.tsx`

**Files:**

- Modify: `src/pages/Home/AccountsTable.tsx`

- [ ] Line 88 has the empty remaining credit cell. Replace:

```tsx
<TableCell className="text-right"></TableCell>
```

with:

```tsx
<TableCell className="text-right">
  {account.type === "credit_card" && account.creditLimit != null ? (
    <Amount value={account.creditLimit + account.computedBalance} />
  ) : null}
</TableCell>
```

> **Note on formula:** `computedBalance` is negative for credit cards (debt = negative, consistent sign convention). Therefore `creditLimit + computedBalance` = remaining available credit. e.g. limit £1000, owe £350 (stored as -350): remaining = 1000 + (-350) = £650.

- [ ] Run:

```bash
bun run lint && bun run check-types && bun run test
```

Expected: all pass.

- [ ] Commit:

```bash
git add src/pages/Home/AccountsTable.tsx
git commit -m "feat: show remaining credit for credit card accounts"
```
