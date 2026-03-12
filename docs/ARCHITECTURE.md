# Budgie Architecture

Electron 40 + React 19 + TypeScript + Tailwind v4 + better-sqlite3 + Drizzle ORM. Single-user desktop personal finance app.

---

## Process Map

```
public/electron.js   Main process (CJS, Node.js) — window, IPC handlers, DB
public/preload.js    Preload (CJS, sandboxed)    — contextBridge API surface
src/                 Renderer (Vite + React)      — all UI code
```

`contextIsolation: true`. Renderer has zero Node access. All DB access goes through IPC.

---

## IPC Pattern

One handler file per entity in `public/ipc/`. Four files change together for each entity:

| File                      | Purpose                          |
| ------------------------- | -------------------------------- |
| `public/ipc/<entity>.js`  | Handler (CJS) — CRUD via Drizzle |
| `public/electron.js`      | Register handler                 |
| `public/preload.js`       | Expose on `window.api`           |
| `src/types/electron.d.ts` | TypeScript interface             |

Channel naming: `<entity>:<verb>` — e.g. `accounts:getAll`, `transactions:create`.

### Handler Files

| File                         | Entity                                             |
| ---------------------------- | -------------------------------------------------- |
| `accounts.js`                | Accounts + computed balances                       |
| `categories.js`              | Categories (hierarchical)                          |
| `transactions.js`            | Transactions + reconciliation + date-range queries |
| `scheduled-transactions.js`  | Scheduled transactions + auto-post                 |
| `account-reconciliations.js` | Reconciliation checkpoints                         |
| `settings.js`                | Preferences                                        |
| `backups.js`                 | Backup/restore + folder management                 |
| `payees.js`                  | Payees + upsert                                    |
| `import.js`                  | QIF file import                                    |
| `envelopes.js`               | Envelopes (active/inactive)                        |
| `envelope-categories.js`     | Envelope↔category mappings                         |
| `budget-allocations.js`      | Monthly budget allocations + quickFill             |
| `budget-transfers.js`        | Budget transfers between envelopes                 |

---

## Database

- File: `~/app_database.db` (configurable via `config.json`)
- WAL mode enabled
- Schema: `src/main/db/schema.ts` — Drizzle `sqliteTable` definitions
- Migrations: `src/main/db/migrations/` — generated with `bun run db:migrate`

### Tables

| Table                    | Purpose                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `accounts`               | Bank, credit card, loan, investment, cash accounts              |
| `categories`             | Hierarchical categories (parent/child, expense/income/transfer) |
| `transactions`           | All transactions; linked transfers via `transferTransactionId`  |
| `accountReconciliations` | Reconciliation checkpoint records                               |
| `scheduledTransactions`  | Recurring transactions (RRule-based)                            |
| `settings`               | User preferences (JSON blob)                                    |
| `payees`                 | Payee auto-complete with default category/amount                |
| `envelopes`              | Budget envelopes                                                |
| `envelopeCategories`     | Maps categories → envelopes                                     |
| `budgetAllocations`      | Monthly assigned amounts per envelope                           |
| `budgetTransfers`        | Transfers between envelopes within a month                      |

To add a table: edit `schema.ts`, run `bun run db:migrate`, rebuild `public/db.js` with `bun run vite build --config vite.main.config.ts`.

---

## Frontend Structure

```
src/
  App.tsx           QueryClientProvider → HashRouter → Routes
  pages/
    Home/           Dashboard — account overview
    AccountTransactions/  Transaction register, import, reconciliation
    Budget/         Envelope budgeting
    Reports/        Charts and financial stats
    Categories/     Category management
    Payees/         Payee management
    ScheduledTransactions/  Scheduled payments + calendar
    Reconcile/      Bank reconciliation workflow
    Forecast/       Balance projection
    Settings/       Preferences + backup/restore
  components/
    layout.tsx      Sidebar + header + main content
    side-menu.tsx   Left nav, account list
    ui/             shadcn components (Base UI variants)
  hooks/            TanStack Query wrappers + business logic
  types/
    electron.d.ts   window.api type declarations
```

### Routes

| Path             | Page                     |
| ---------------- | ------------------------ |
| `/`              | Home (account dashboard) |
| `/accounts/:id`  | Account transactions     |
| `/categories`    | Category management      |
| `/payees`        | Payee management         |
| `/scheduled`     | Scheduled transactions   |
| `/reconcile/:id` | Bank reconciliation      |
| `/forecast/:id`  | Balance forecast         |
| `/budget`        | Envelope budgeting       |
| `/reports`       | Financial reports        |
| `/settings`      | Settings                 |

`HashRouter` — required for `file://` in production builds.

---

## Data Fetching

TanStack Query v5. No global state library. Server state in query cache, UI state in component-local `useState`.

Each entity has a custom hook in `src/hooks/` wrapping queries and mutations. Mutations invalidate relevant query keys on success.

---

## Styling

Tailwind v4 — all config in `src/index.css`, no `tailwind.config.ts`.

- Design tokens: `oklch()` color space in `:root` / `.dark`
- Dark mode: `.dark` class on `<html>`, synced to system preference
- Font: Noto Sans Variable
- Chart palette: `--chart-1` through `--chart-5`
- UI primitives: shadcn component registry (Base UI variants, not Radix)

---

## Build

| Command              | What it does                                            |
| -------------------- | ------------------------------------------------------- |
| `bun run start`      | Vite dev server on :3000 + Electron (wait-on)           |
| `bun run build`      | Vite renderer build → Vite DB build → electron-builder  |
| `bun run db:migrate` | `drizzle-kit generate` — SQL migration from schema diff |

Two Vite builds:

- `vite.config.ts` — renderer: `src/` → `build/`, `base: "./"` for `file://`
- `vite.main.config.ts` — DB module: `src/main/db/index.ts` → `public/db.js` (CJS)

---

## Testing

Vitest. 255+ tests across integration and unit suites.

```
src/tests/
  integration/     IPC handlers against in-memory SQLite
  unit/            Pure function tests (budget computations, forecasting)
```

Key patterns:

- `createTestDb()` — in-memory SQLite with all migrations
- `createMockIpc()` — loads real CJS handlers, bypasses Electron
- System time pinned to `2026-03-07` in integration tests
- Sequential stateful tests — each `it` block builds on prior DB state
