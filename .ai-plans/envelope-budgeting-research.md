# Envelope Budgeting — Design Research

## 1. Standard Data Model

Core tables across YNAB, Actual Budget, and similar apps:

| Table                | Purpose                                          |
| -------------------- | ------------------------------------------------ |
| `category_groups`    | Group envelopes (e.g. "Housing", "Food", "Fun")  |
| `categories`         | Individual envelopes, FK to group                |
| `budget_allocations` | Per-category, per-month assigned amounts         |
| `transactions`       | Spending/income, FK to category + account        |
| `accounts`           | Bank accounts (on-budget vs off-budget/tracking) |

Relationships:

- `category_groups` 1:N `categories`
- `categories` 1:N `budget_allocations` (one per month)
- `categories` 1:N `transactions`

### Minimal `budget_allocations` table

```
id, category_id, month (TEXT "2026-03"), amount (integer, milliunits or real)
```

This is the key new table. Everything else (balance, activity, available) is **derived** at query time.

---

## 2. How YNAB / Actual Structure It

### YNAB

- **Category** has: `budgeted` (assigned), `activity` (sum of txns), `balance` (available = assigned - spent + carryover)
- **CategoryGroup** is just id + name + hidden + ordering
- Amounts in **milliunits** (integer, 1000 = $1.00) to avoid float issues
- Rich **goal system**: target balance (TB), target by date (TBD), monthly funding (MF), needed for spending (NEED), debt payoff (DEBT)
- Goals are stored as fields on the category itself, not a separate table

### Actual Budget

- Uses a **spreadsheet engine** internally — each month is a "sheet" with cells like `budget-{categoryId}`
- Tables: `zero_budgets` (envelope allocations), `zero_budget_months` (month-level metadata like buffered amount), `reflect_budgets` (for tracking/report mode)
- `category_groups` and `categories` with soft delete + hidden flags
- Supports two modes: **envelope** (YNAB-style) and **tracking** (report-style, no allocation)

### Common pattern

Both store **only the assigned/budgeted amount** per category per month. Activity and balance are always computed from transactions.

---

## 3. "Available to Budget" Calculation

Formula (consistent across YNAB and Actual):

```
Available to Budget = Total Income (this month)
                    + Unbudgeted from last month (rolled forward)
                    - Total Assigned (sum of all category budgets this month)
                    - Last month's overspending (uncovered negative balances)
```

Actual's implementation:

```
available-funds = total-income + from-last-month
to-budget = available-funds + last-month-overspent + total-budgeted
```

Where `total-budgeted` is negative (money leaving the pool) and `last-month-overspent` is negative (debt from prior month).

**Key rule**: You can only budget money you have. If available-to-budget goes negative, you've over-assigned.

---

## 4. Budget Periods (Months)

- Stored as `YYYY-MM` string (not a date range)
- Each category gets **one row per month** in the allocations table
- Rows are created on demand — no row means $0 budgeted
- Income is assigned to the month it's received, not earned
- Unassigned income rolls forward automatically (it's just "available to budget" in the next month)

### Actual's approach

- Month metadata stored in `zero_budget_months`: `{ id: "2026-03", buffered: 0 }`
- Per-category: `zero_budgets`: `{ id, month, category, amount, carryover }`
- The `carryover` flag controls overspend behavior (see below)

---

## 5. Overspend Handling

Two strategies (both used in Actual, YNAB uses the first):

### Default: Overspend resets to zero, reduces next month's available

- Category balance goes negative during the month (spent > budgeted + carryover)
- At month end, negative balance is **zeroed out**
- The deficit is subtracted from next month's "Available to Budget"
- Forces you to cover it by reducing other envelopes

### Optional: Overspend carries forward as category debt (Actual's "carryover" flag)

- Negative balance stays on the category into the next month
- Does NOT reduce "Available to Budget"
- Category starts next month in the red — must budget extra to cover
- Useful for credit card categories

### YNAB credit card handling

- Credit card categories are special — overspending on a credit card creates debt on the card category, not on the spending category
- Cash overspending (debit) reduces next month's available-to-budget
- Credit overspending creates credit card debt (stays on card envelope)

---

## 6. Transfers Between Envelopes

- **Not a separate table** — just update two `budget_allocations` rows
- Move $50 from "Dining" to "Groceries": decrease Dining's budgeted by 50, increase Groceries' by 50
- "Available to Budget" stays unchanged (zero-sum)
- UI shows this as a simple move action, not a transaction
- Some apps log these moves for audit trail, but it's optional

### Account transfers vs envelope transfers

- **Envelope transfer**: move budget between categories (no transaction created)
- **Account transfer**: move money between bank accounts (creates paired transactions, no budget impact if both on-budget)

---

## 7. Typical Reporting Views

| Report                       | Description                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| **Monthly budget grid**      | The main view — categories grouped, showing budgeted / activity / available per month |
| **Spending by category**     | Pie/bar chart, actual spend per category for a period                                 |
| **Spending vs budget**       | Category-level variance (over/under)                                                  |
| **Income vs expense**        | Monthly trend, net savings                                                            |
| **Net worth**                | All accounts over time (on + off budget)                                              |
| **Age of money**             | YNAB-specific: median days between receiving and spending money                       |
| **Spending trends**          | Multi-month category spend comparison                                                 |
| **Budget vs actual heatmap** | Which envelopes consistently over/under                                               |

---

## Implications for Budgie

### What changes from 50/30/20

| 50/30/20 (current)                     | Envelope (proposed)                                    |
| -------------------------------------- | ------------------------------------------------------ |
| 3 buckets, auto-calculated from income | N categories, manually assigned                        |
| `budgetClass` on category              | `budget_allocations` table (category + month + amount) |
| Targets = income \* ratio              | Targets = whatever you assign                          |
| No carryover concept                   | Positive balances roll forward                         |
| No "available to budget"               | Core metric: unassigned money                          |

### New tables needed

1. **`category_groups`** — replace flat category list with groups (or repurpose `parentId`)
2. **`budget_allocations`** — `(id, category_id, month TEXT, amount REAL)`
3. Optionally: **`budget_month_meta`** — `(month TEXT PK, notes TEXT)` for month-level notes

### Can keep

- `categories` table (add `hidden` flag, keep or drop `budgetClass`)
- `transactions`, `accounts`, `scheduled_transactions` — unchanged
- `parentId` on categories could serve as category_groups if you don't want a separate table

### Key calculations (all derived, no stored balances)

- **Category activity** = `SUM(transactions.amount) WHERE category_id = X AND month = Y`
- **Category available** = `budget_allocation.amount + activity + carryover_from_prev_month`
- **Available to budget** = `total_income - SUM(all allocations) - uncovered_overspends + prev_month_surplus`

---

## Unresolved Questions

- Use integer milliunits (like YNAB) or keep REAL amounts?
- Separate `category_groups` table or keep using `parentId` self-reference?
- Support credit card overspend-as-debt or just the simple "reduces next month" model?
- Keep `budgetClass` alongside envelopes (for quick classification) or drop entirely?
- Off-budget/tracking accounts — worth adding now?
- Goal system (target by date, monthly funding need) — scope for v1?
