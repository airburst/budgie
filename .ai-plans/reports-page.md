# Reports Overview Page

## Context

Add a `/reports` route showing financial health at a glance: spending by category (donut), income vs expenses (bar), net worth trend (area), and four stat cards. Charts are maximisable to full-screen with 150ms animated transition.

**Correlation with budgeting**: both features need date-ranged transaction queries. Plan uses a shared `transactions:getByDateRange` IPC handler (more flexible than budgeting's `getByMonth` — budgeting can use it too). Spending chart can optionally colour by `budgetClass` once that lands.

---

## Phase 1: IPC — `transactions:getByDateRange`

Add to `public/ipc/transactions.js`:

```js
ipcMain.handle(
  "transactions:getByDateRange",
  (_, startDate, endDate, accountIds) => {
    const conditions = [
      gte(schema.transactions.date, startDate),
      lte(schema.transactions.date, endDate),
    ];
    if (accountIds?.length) {
      conditions.push(inArray(schema.transactions.accountId, accountIds));
    }
    return db
      .select()
      .from(schema.transactions)
      .where(and(...conditions))
      .orderBy(asc(schema.transactions.date));
  },
);
```

Import `gte`, `lte` from `drizzle-orm` (add to existing destructure).

Wire through:

- `public/preload.js` — `getTransactionsByDateRange: (start, end, ids) => ipcRenderer.invoke("transactions:getByDateRange", start, end, ids)`
- `src/types/electron.d.ts` — `getTransactionsByDateRange: (startDate: string, endDate: string, accountIds?: number[]) => Promise<Transaction[]>`

Replaces the `transactions:getByMonth` from the budgeting plan — budgeting can call this with month start/end dates instead.

---

## Phase 2: Date Range Select

**New file: `src/components/date-range-select.tsx`**

Dropdown using existing `Select` component with presets:

- Last 30 Days (default), Last 60 Days, Last 90 Days
- This Month, Last Month, This Year, Custom

When "Custom" selected, show two `DatePicker` components inline. `minDate` prop clamps start to earliest transaction date.

```ts
type DateRangeValue = { startDate: string; endDate: string; preset: string };
```

---

## Phase 3: Account Multi-Select

**New file: `src/components/account-select.tsx`**

Uses existing `Combobox` + `ComboboxChips` for multi-select. Empty selection = "All Accounts" (default).

```ts
type AccountSelectProps = {
  accounts: AccountWithBalances[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
};
```

---

## Phase 4: Chart Card with Maximise

**New file: `src/components/chart-card.tsx`**

Wraps `Card` with a maximise button (`Maximize2` icon) in `CardAction`. When maximised:

- Renders content in a `position: fixed; inset: 0` overlay via portal
- CSS `transition: opacity 150ms ease, transform 150ms ease`
- Shows `X` icon to restore
- Escape key also restores

No extra dependencies — plain CSS transitions.

---

## Phase 5: Data Hook — `useReportsData`

**New file: `src/hooks/useReportsData.ts`**

`useReportsData(startDate, endDate, accountIds)` returns:

- **spendingByCategory**: group expense txns by categoryId, sum amounts, top 5 + "Other". Exclude transfer-type categories.
- **incomeVsExpenses**: group by month (YYYY-MM), sum income vs expense per month. Exclude transfers.
- **netWorthOverTime**: monthly snapshots of net worth across the date range. Net worth = sum of `account.computedBalance` at each month-end, calculated by working backwards from current balances using transaction sums. Uses all accounts (bank + investment + cash as assets; credit_card + loan as liabilities).
- **stats**:
  - Total Assets: sum of positive `computedBalance` across bank/cash/investment accounts
  - Total Debt: sum of abs(negative `computedBalance`) across credit_card/loan accounts
  - Monthly Surplus: income − expenses for most recent complete month in range
  - Saving Rate: `(surplus / income) * 100` for that month

Query keys: `["transactions", "dateRange", startDate, endDate, accountIds]`, `["categories"]`, `["accounts"]`.

---

## Phase 6: Reports Page

**New file: `src/pages/Reports/ReportsPage.tsx`**

Layout:

```
[Title]                              [DateRangeSelect] [AccountSelect]
┌──────────────────┐ ┌──────────────────────────────┐
│ Spending by Cat  │ │ Income vs Expenses           │
│ (PieChart/donut) │ │ (BarChart grouped)           │
└──────────────────┘ └──────────────────────────────┘
┌──────────────────────────────────────────────────────┐
│ Net Worth Trend (AreaChart, full width)               │
└──────────────────────────────────────────────────────┘
┌───────────┐ ┌───────────┐ ┌──────────────┐ ┌─────────┐
│Total      │ │Total      │ │Monthly       │ │Saving   │
│Assets     │ │Debt       │ │Surplus       │ │Rate     │
└───────────┘ └───────────┘ └──────────────┘ └─────────┘
```

Charts:

- **Spending by Category**: recharts `PieChart` + `Pie` with `innerRadius` for donut. Total in centre. Legend right-side with category names, amounts, percentages.
- **Income vs Expenses**: recharts `BarChart` with two `Bar` series (income=green, expenses=coral). Legend shows dot indicators.
- **Net Worth Trend**: recharts `AreaChart` + `Area` with gradient fill. Growth badge in card header (e.g. "+£2.4k").

All use `ChartContainer` + `ChartConfig` pattern from `src/components/ui/chart.tsx`.

Empty state: centred muted text per chart card when no transactions. Stat cards show £0 / 0%.

---

## Phase 7: Routing + Navigation

- `src/App.tsx` — add lazy route `/reports` → `ReportsPage`
- `src/components/header.tsx` — add `{ to: "/reports", label: "Reports", end: false }` to `navLinks`

---

## Files Summary

| File                                   | Action                                    |
| -------------------------------------- | ----------------------------------------- |
| `public/ipc/transactions.js`           | Add `transactions:getByDateRange` handler |
| `public/preload.js`                    | Add `getTransactionsByDateRange` bridge   |
| `src/types/electron.d.ts`              | Add type                                  |
| `src/components/date-range-select.tsx` | **New**                                   |
| `src/components/account-select.tsx`    | **New**                                   |
| `src/components/chart-card.tsx`        | **New**                                   |
| `src/hooks/useReportsData.ts`          | **New**                                   |
| `src/pages/Reports/ReportsPage.tsx`    | **New**                                   |
| `src/App.tsx`                          | Add route                                 |
| `src/components/header.tsx`            | Add nav link                              |

---

## Verification

1. `bun run lint && bun run check-types` — clean
2. `bun run test` — all pass
3. Manual: navigate to /reports → charts render with data
4. Manual: change date range → data updates
5. Manual: filter accounts → charts filter
6. Manual: maximise each chart → full-screen, 150ms transition
7. Manual: empty DB → empty states shown

---

## Resolved Decisions

- Saving Rate: `(income - expenses) / income * 100` — no dependency on budgetClass
- Transfer-type transactions excluded from all charts (spending, income vs expenses)
- Shared `getByDateRange` IPC used by both reports and budgeting features
- Currency assumed GBP throughout
