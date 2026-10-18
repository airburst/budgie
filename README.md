# Budgie

Personal finance app for desktop (Electron) and the web (offline-first PWA at https://budget.fairhursts.net). React 19 + TypeScript + Tailwind v4 + SQLite (better-sqlite3 + Drizzle ORM on desktop, SQLite WASM on the web). One codebase, local-first: your data stays on your device.

## Features

- **Accounts** — bank, credit card, loan, investment, cash; multi-currency
- **Transactions** — register with payee auto-complete, category assignment, transfers between accounts
- **Categories** — hierarchical (parent/child), expense/income/transfer types
- **Scheduled transactions** — RRule-based recurrence, auto-post, calendar view
- **Reconciliation** — checkpoint-based bank reconciliation workflow
- **Envelope budgeting** — assign categories to envelopes, monthly allocations, rollover, transfers between envelopes, underfunded detection
- **Reports** — spending by category (donut), income vs expenses (bar), net worth trend (area), summary stats; filterable by date range and account
- **Forecasting** — projected account balance based on scheduled transactions
- **QIF import** (desktop) — import transactions from QIF files
- **Backups** (desktop) — automatic on quit, manual create/restore, 30-day retention
- **Portable data** — export/import between desktop and web
- **Mobile-first web app** — installable PWA, works offline
- **Dark mode** — system-preference aware, instant paint

## Quick Start

```bash
bun install
bun run start        # dev: Vite on :3000 + Electron
bun run dev          # dev: web app only, Vite on :3000 with hot reload
```

## Scripts

| Command               | Description                            |
| --------------------- | -------------------------------------- |
| `bun run dev`         | Web app dev server (hot reload)        |
| `bun run start`       | Dev server + Electron                  |
| `bun run build`       | Production build (Electron)            |
| `bun run build:web`   | Web artifact (`build/`)                |
| `bun run verify:web`  | Build + verify the web artifact        |
| `bun run test:e2e`    | Playwright e2e (Chromium)              |
| `bun run test`        | Run all tests (Vitest)                 |
| `bun run lint`        | ESLint --fix                           |
| `bun run check-types` | TypeScript type check                  |
| `bun run db:migrate`  | Generate migration from schema changes |

## Web Deployment

GitHub Actions deploys verified build artifacts to the Cloudflare Pages Direct
Upload project `budgie-web`, whose production branch must be `main`.
Production is https://budget.fairhursts.net. See `docs/RELEASE_RUNBOOK.md` for
the full release, rollback and rehearsal procedures.

- Repository secrets: `CLOUDFLARE_API_TOKEN` (Cloudflare Pages Edit permission)
  and `CLOUDFLARE_ACCOUNT_ID`.
- Pull requests build and verify the artifact but do not deploy a preview.
- To preview any branch, run the **Web Deploy** workflow manually and pick the
  branch (optional `alias` and `project` inputs). There is no automatic
  deployment on push, pull request or merge.
- Pushing a `v*` tag (which must be on `main`) runs lint, types, unit and e2e
  checks and then deploys production using the `main` Pages branch, while the
  Release workflow builds Electron from the same tag.
- Each deployment downloads the verified artifact from its workflow run;
  artifacts are retained for 30 days.

Run `bun run verify:web` to build and verify the deployment artifact locally.
The build generates Cloudflare security/isolation headers and the offline
precache. Keep preview access protection enabled in Cloudflare Access. Use a
stable preview alias for device testing: browser databases are isolated by
origin, so a different preview URL starts with separate local data.

## Convert PNG to icns

https://www.aconvert.com/image/jpg-to-icns/

## Issues with released versions

I do not have an Apple developer account, so this app is not notarized with a signed certificate. On Macs this can result in a popup message after trying to run a new version:

> "Budgie.app is damaged and can’t be opened. You should move it to the Bin"

If you see this, either override in Privacy and Settings, or run the command

```bash
xattr -d com.apple.quarantine /Applications/Budgie.app
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Features](docs/FEATURES.md)
- [Release runbook](docs/RELEASE_RUNBOOK.md)
- [Manual checklist](docs/PHASE4_MANUAL_CHECKLIST.md)
- [Backlog and open decisions](docs/BACKLOG.md)
- [Web target plan](docs/WEB_TARGET_PLAN.md), [route map](docs/WEB_ROUTE_MAP.md), [Phase 5 UX plan](docs/PHASE5_UX_PLAN.md), [hosted sync plan (future)](docs/SYNC_ENGINE_PLAN.md)
