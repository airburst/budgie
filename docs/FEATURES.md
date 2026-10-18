# Budgie Features

Budgie runs as an Electron desktop app and as an installable, offline-first web
app (PWA) with a mobile-first interface. Features are the same on both unless
marked.

## Platforms

- **Desktop (Electron):** SQLite file in your data folder, automatic backups,
  QIF import, auto-update notifications.
- **Web / PWA:** data lives in the browser (OPFS) on that device only; works
  offline once loaded. Clearing site data deletes it, so export regularly.
- **Phone, tablet and desktop layouts:** cards, drawers and a header that carries
  the title, back arrow and primary action on phones.
- **Portable data:** Settings → Export/Import moves your data between desktop and
  browser (import replaces the device's data).

## Accounts

Multiple account types: bank, credit card, loan, investment, cash. Each tracks balance, currency (default GBP), optional interest rate and credit limit. Accounts appear in the sidebar grouped by type with running balances.

## Transactions

Full transaction register per account. Each transaction has: date, payee, amount, category, notes, cleared/reconciled status. Supports:

- **Transfers** — linked paired transactions between accounts via `transferTransactionId`. Outgoing creates matching incoming automatically.
- **Payee auto-complete** — remembers last category and amount per payee.
- **QIF import** (desktop only) — import transactions from QIF files via file chooser dialog.

## Categories

Hierarchical (parent → child). Three types: expense, income, transfer. Soft-delete to preserve historical data. Used across transactions, scheduled payments, and budget envelopes.

## Scheduled Transactions

Recurring payments using RRule (RFC 5545). Features:

- **Recurrence patterns** — daily, weekly, monthly with interval/day-of-week/day-of-month controls
- **Auto-post** — automatically creates transactions N days in advance of due date
- **Calendar view** — visual upcoming schedule
- **Skip** — move a schedule to its next date without posting (confirms first)
- **Record payment** — manually post a single occurrence
- **Active/inactive** — pause without deleting

Auto-post runs at app startup, sweeping all due scheduled transactions.

## Reconciliation

Checkpoint-based bank reconciliation:

1. Enter statement balance and date
2. Mark transactions as cleared
3. System shows difference between cleared total and statement balance
4. When balanced, commit — marks cleared transactions as reconciled

Historical reconciliation records stored for audit trail.

## Envelope Budgeting

Zero-based budgeting with envelope method:

- **Envelopes** — named budget categories (e.g. Groceries, Rent, Savings)
- **Category mapping** — assign expense and transfer categories to envelopes (income excluded)
- **Monthly allocations** — assign budget amounts per envelope per month
- **Available to Budget (ATB)** — income minus total assigned across all envelopes
- **Rollover** — unspent amounts carry forward; overspending rolls as negative
- **Transfers** — move money between envelopes within a month
- **Underfunded detection** — warns when envelope has negative available balance
- **Onboarding** — template-based quick setup for common envelope structures

Transfer transactions (e.g. bank → savings) correctly reduce the sending envelope without double-counting the receiving side.

## Reports

Financial analysis with interactive charts:

- **Spending by category** — donut chart, top 5 + "Other" rollup
- **Income vs expenses** — grouped monthly bar chart
- **Net worth trend** — area chart with gradient fill, computed from account balances
- **Summary stats** — total assets, total debt, monthly surplus, savings rate

Filters: date range presets (30/60/90 days, this/last month, this year) and multi-account selection. Charts expand to full screen, and each chart has a text "Show values" list.

## Forecasting

Projects future account balance based on scheduled transactions. Shows day-by-day balance projection from current date forward.

## Backups (desktop)

- **Auto-backup** — creates backup on app quit
- **Manual backup** — create/restore/delete from settings
- **Configurable folder** — default `~/Documents/Budgie`
- **30-day retention** — old backups auto-cleaned
- **Full restore** — replaces database file, handles WAL cleanup

## Settings

- Custom data folder location (move database between directories)
- Backup folder configuration
- Dark/light mode (follows system preference)
- Portable data export/import (all platforms)

## Dark Mode

System-preference aware with instant paint (inline script sets `.dark` class before React hydration). Full oklch() color palette for both modes.
