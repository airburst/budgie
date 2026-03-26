# Budgie

Desktop personal finance app. Electron 40 + React 19 + TypeScript + Tailwind v4 + SQLite (better-sqlite3 + Drizzle ORM).

## Features

- **Accounts** — bank, credit card, loan, investment, cash; multi-currency
- **Transactions** — register with payee auto-complete, category assignment, transfers between accounts
- **Categories** — hierarchical (parent/child), expense/income/transfer types
- **Scheduled transactions** — RRule-based recurrence, auto-post, calendar view
- **Reconciliation** — checkpoint-based bank reconciliation workflow
- **Envelope budgeting** — assign categories to envelopes, monthly allocations, rollover, transfers between envelopes, underfunded detection
- **Reports** — spending by category (donut), income vs expenses (bar), net worth trend (area), summary stats; filterable by date range and account
- **Forecasting** — projected account balance based on scheduled transactions
- **QIF import** — import transactions from QIF files
- **Backups** — automatic on quit, manual create/restore, 30-day retention
- **Dark mode** — system-preference aware, instant paint

## Quick Start

```bash
bun install
bun run start        # dev: Vite on :3000 + Electron
```

## Scripts

| Command               | Description                            |
| --------------------- | -------------------------------------- |
| `bun run start`       | Dev server + Electron                  |
| `bun run build`       | Production build                       |
| `bun run test`        | Run all tests (Vitest)                 |
| `bun run lint`        | ESLint --fix                           |
| `bun run check-types` | TypeScript type check                  |
| `bun run db:migrate`  | Generate migration from schema changes |

## Convert PNG to icns

https://www.aconvert.com/image/jpg-to-icns/

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Features](docs/FEATURES.md)
