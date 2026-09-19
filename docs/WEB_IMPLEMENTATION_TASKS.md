# Web Implementation Tasks

This document turns the phase 0 proof into implementation work. The disposable
probe is not production code.

## Phase 0 Result

- Official SQLite WASM 3.53.4 loaded in a dedicated worker through Vite.
- `opfs-sahpool` opened a persistent database and survived probe reload.
- JSON functions, foreign keys, aggregates, `RETURNING`, and rollback passed.
- Vite required `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` for the worker/OPFS path.
- The result is a no-sync feasibility proof, not a decision to adopt a sync
  engine or to expose SQLite directly to UI code.

## Remaining Phase 0 Gates

### Step 1: Migration bundling

Status: complete for the bundling boundary, not yet complete for browser
execution. `src/web/db/migrations.ts` uses Vite `?raw` imports to bundle the
existing SQL files, and its unit contract verifies all 13 journal tags and
their Drizzle statement breakpoints. The current Electron loader remains
filesystem-based by design. The next adapter must split or execute these
statements with the same migration bookkeeping and must test a fresh database
and an upgrade database.

Finding: breakpoints are optional in the current migration set; valid
single-statement migrations exist. A browser executor must not reject those
files merely because they have no breakpoint marker.

Validation: `bun run test -- src/tests/unit/migration-manifest.unit.test.ts`,
`bun run lint`, and `bun run check-types` pass.

Execution result: the real Vite worker applied all 13 migrations in a fresh
`opfs-sahpool` database using SQLite WASM 3.53.4. Reloading the same database
skipped all 13 migrations, confirming persisted bookkeeping and an idempotent
upgrade path. The browser smoke page was temporary and has been removed.

Finding: the executor now uses Drizzle SQLite's `__drizzle_migrations` table
shape and `created_at` ordering. The browser records the migration tag as the
stored hash; Drizzle currently uses the hash for metadata but decides whether
to apply migrations from `created_at`. This removes the provisional browser
table, and physical Electron-file coverage is recorded below.

Validation: a real Vite browser worker using SQLite WASM 3.53.4 and
`opfs-sahpool` applied all 13 migrations on first load and skipped all 13 after
reload. The smoke page was temporary and has been removed.

Compatibility result: a focused contract test now runs the real Electron
Drizzle migrator against an in-memory `better-sqlite3` database, then passes
that same SQLite metadata through the browser executor. All 13 Electron rows
were recognized and skipped by the browser path. This proves metadata
compatibility; cross-device/browser release coverage remains external work.

Physical-file result: the same contract now runs against a temporary
WAL-enabled `better-sqlite3` file, matching Electron startup. The browser
executor recognized all 13 migration rows, and the file contained the expected
13-row `__drizzle_migrations` history before cleanup.

- [x] Run the same migration contract in current Chromium. First load applied
      all 13 migrations; reload skipped all 13.
- [x] Run the same migration contract in current Safari. First load applied
      all 13 migrations using SQLite WASM 3.53.4 and `opfs-sahpool`.
- [ ] Measure startup, migration, bulk import, reporting queries, and a large
      transaction dataset in Chromium and Safari.
- [x] Verify Chromium reload persistence through the OPFS migration history.
- [x] Record a Chromium reopen baseline: 132 ms for the persisted migration
      database, approximately 410 KB reported usage, and approximately 5.6 GB
      reported quota in the local test profile.
- [x] Record Chromium persistent-storage request behavior: on localhost,
      `persisted()` was false before and after `persist()`, and the request
      returned false while OPFS reload persistence still worked.
- [x] Record Safari first-load baseline: approximately 193 ms startup,
      approximately 4 MiB reported usage, and approximately 82.5 GB reported
      quota in the local Safari profile. `persisted()` was false before and
      after `persist()`, and the request returned false.
- [x] Verify Safari reload persistence: a second load skipped all 13
      migrations, took approximately 199 ms, and reported approximately 208
      KiB usage with the same approximately 82.5 GB quota.
- [ ] Verify Safari persistence across browser restart, PWA
      installation where supported, and storage pressure; record quota,
      private browsing, and denied-persistence behavior.
- [ ] Validate WASM and worker loading in Chromium and Safari on localhost,
      Cloudflare preview, and offline service-worker mode.
- [x] Compare the no-sync baseline with the PowerSync browser VFS spike using
      the same contract before changing the production schema.

Deferred: physical iPhone, iPadOS, Android, Firefox, and Chromium device runs
are intentionally outside the current phase 0 gate. Reopen that matrix before
public mobile launch or when browser storage behavior changes materially.

Finding: Chromium reported `navigator.storage.persisted() === false` on
localhost during the baseline. The OPFS database still survived reload, but
this does not prove protection from eviction. Test `navigator.storage.persist()`
and browser-restart/storage-pressure behavior before treating persistence as
approved.

The explicit Chromium `navigator.storage.persist()` request also returned
false in the local probe. This may reflect localhost policy or the lack of a
user gesture, so repeat it from the eventual install/settings flow. Regardless,
the runtime must expose persistence denial distinctly and avoid claiming
eviction protection when the browser declines the request.

Safari produced the same denial pattern in the interactive localhost probe:
OPFS initialization and migration succeeded, but `persist()` returned false
and `persisted()` remained false. Its reported quota was much larger than
Chromium's local profile, so quota numbers are browser/profile telemetry rather
than an application guarantee.

Safari reload persistence passed: the second interactive load skipped all 13
migrations. Browser restart, PWA installation, storage pressure, and private
browsing behavior remain untested.

### Interactive validation runbook

Use a disposable browser profile and the temporary probe page when running
these checks. Record browser version, OS, URL, timestamp, and the complete JSON
output; do not use a real Budgie database.

1. Load the probe once and confirm `applied` contains all 13 migrations.
2. Reload and confirm `applied` is empty and `skipped` contains all 13.
3. Quit the browser completely, reopen the same profile, load the same probe,
   and confirm the second-load result still has all 13 migrations in `skipped`.
4. Repeat in a private window/profile and record whether OPFS is unavailable,
   transient, or persistent after reload.
5. Install the PWA where supported, repeat the reload and quit/reopen checks,
   and record whether `navigator.storage.persist()` changes from false.
6. Use browser storage tools or OS pressure simulation to test quota/eviction;
   record the first error and whether the existing database remains readable.

Expected interpretation: `skipped` proves the database survived the previous
run; `persisted: true` proves the browser granted eviction protection. These
are separate outcomes. A false persistence request must be reported as a
capability limitation, not treated as a migration failure.

## First Production Slice

- [x] Add the platform-neutral `ApplicationAPI` type name while preserving the
      Electron preload contract.
- [x] Add an injectable platform capability factory and `usePlatform()` hook.
- [x] Define the shared asynchronous `DatabaseCapability` contract and add an
      Electron adapter with serialized transaction handles.
- [x] Implement the browser SQLite WASM worker/client behind the same contract;
      keep one connection alive and serialize commands through the worker.
- [x] Choose SQLite WASM with `opfs-sahpool` as the provisional no-sync browser
      adapter behind the shared asynchronous capability interface.
- [x] Bundle the existing migration SQL for browser loading without
      filesystem-based discovery.
- [x] Execute bundled migrations in a browser database and verify fresh and
      upgrade paths.
- [x] Create a dedicated database worker with serialized commands.
- [x] Add explicit worker startup failure states and recovery behavior.
- [x] Add the origin-wide Web Lock/BroadcastChannel coordinator and connect it
      to web startup with an inactive-instance screen.
- [x] Add persistent-storage requests and distinct OPFS, quota, corruption,
      migration, and private-browsing errors.
- [x] Add a browser manifest and runtime service worker that caches the loaded
      offline application assets without replacing an active session.
- [x] Add automated Chromium coverage for isolated worker startup, OPFS
      runtime initialization, single-active-page locking, service-worker
      registration/update, and offline reload.
- [x] Add a browser ApplicationAPI contract smoke test covering shared account
      creation and shared-service reads over the SQLite WASM worker.
- [x] Add a pull-request web-platform gate for lint, type checks, Vitest, and
      the production-preview Chromium suite.
- [x] Extract accounts, categories, transactions, reconciliation, scheduled,
      settings, payees, envelopes, and budgets behind shared capability
      services; migrated SQLite coverage exists for the high-risk operations.
- [x] Wire the extracted entity channels through the built shared service
      bundle and the existing Electron SQLite connection.
- [x] Add a built-service-bundle contract test that verifies Electron's
      CommonJS output exports and constructs every shared database-domain
      factory; full Electron/browser behavioral parity remains.
- [x] Add a migration metadata contract test using the real Electron Drizzle
      migrator and browser executor.
- [x] Add physical WAL-enabled Electron database-file coverage for migration
      metadata compatibility.

Adapter finding: the browser worker must return query rows through the RPC
result envelope's `value` field. The first smoke run exposed a client bug that
returned the whole envelope; the corrected worker/client smoke run passed
schema query, transactional insert/query, and worker close behavior.

Domain-service checkpoint: `src/services/accounts.ts` now contains typed
account CRUD, balance projections, transfer-category side effects, and
reference-aware soft deletion over `DatabaseCapability`. Real migrated SQLite
tests cover account creation, computed/cleared balances, transfer categories,
and soft deletion. IPC wiring remains intentionally next so Electron behavior
can be switched to the service without changing renderer consumers.

Transaction checkpoint: `src/services/reconciliation.ts` now performs
reconciliation updates and checkpoint insertion through one async transaction
handle. Migrated SQLite tests prove successful flag/checkpoint updates and
rollback when checkpoint insertion fails. Transfer pairing and transaction CRUD
remain to be extracted before replacing the existing IPC handler.

Transaction service checkpoint: `src/services/transactions.ts` now provides
typed reads, normal transaction creation, atomic transfer pairing, and guarded
deletion over the shared capability. Migrated SQLite tests cover transfer
counter creation, missing-target fallback, deletion, and reconciled-row
protection. Transfer-aware update propagation is covered for amount and payee
changes, and category conversion now covers both normal-to-transfer and
transfer-to-normal atomic paths. IPC wiring for these channels is recorded
below; remaining entities still use legacy handlers.

IPC checkpoint: `src/services/index.ts`, `vite.services.config.ts`, and
`public/services.js` provide a CommonJS build boundary for Electron. Accounts,
transaction and reconciliation channels now use those services through one
capability wrapper around the existing SQLite connection. Settings, payees,
categories, envelopes, mappings, and budgets now use the same bundle.

Budget finding: allocation upsert deliberately retains the current
query-then-update/insert behavior because the existing schema has no unique
`(envelope_id, month)` constraint.

Entity-boundary result: account reconciliation CRUD is now shared-service
backed as well. All database-domain IPC channels use `public/services.js`; only
backups and QIF import remain legacy because they depend on Electron dialogs,
filesystem paths, or native database backup APIs.

Scheduled-service checkpoint: scheduled transaction CRUD now uses the shared
capability and Electron IPC bundle. The existing recurrence and auto-post
operation now uses the shared async service and transaction creation path;
Electron startup invokes it through the capability. A migrated SQLite test
covers overdue posting and exhausted-schedule removal. Resume-triggered web
execution remains to be added with the platform lifecycle service.

Runtime checkpoint: browser database commands now fail closed if initialization
fails, and `src/web/runtime/instance-lock.ts` provides an origin-wide Web Lock
with BroadcastChannel announcements. `src/index.tsx` connects it before React
mounts and renders inactive/startup failure states.

Platform checkpoint: the Electron-only update listener is now gated by
`usePlatform().capabilities.nativeUpdates`, so direct web startup no longer
accesses `window.api` for native update events.

Web-runtime checkpoint: `src/web/runtime/runtime.ts` now connects the lock,
browser database worker, persistence request, and shared auto-post operation.
Startup returns `null` for an inactive tab, reports persistence as granted,
denied, or unavailable, runs overdue auto-posting, and exposes resume/shutdown
lifecycle methods. The browser `ApplicationAPI` bridge is installed before
React mounts, and native-only operations fail explicitly in the browser.

## Phase 0 Approval Status

## Phase 1 Local Foundation Status

Complete for the current local implementation scope. The platform-neutral API,
async database capability, Electron/browser adapters, shared database-domain
services, serialized browser worker, startup lifecycle, inactive-instance
handling, persistence-state reporting, Electron IPC bundle, and contract tests
are implemented and validated. Backups and QIF import remain deliberately
native Electron boundaries.

Phase 1 does not waive the remaining phase 0 external validation below.

Repository-local proof is complete. Full phase 0 approval remains blocked on
external validation that cannot be performed reliably from this development
workspace:

- Current Safari run covering startup, migrations, import, reporting, and large
  datasets.
- Safari persistence under browser restart, PWA installation, storage pressure,
  private browsing, quota exhaustion, and denied persistence.
- Chromium reload persistence and migration execution are complete; browser
  restart, quota, pressure, and offline deployment checks remain to be recorded.
- Cloudflare preview and offline service-worker asset loading.
- The local web-target gate and provider-neutral sync-ready data work belong
  here. Hosting, sync-engine selection, and provider-specific schema
  decisions are owned by `docs/SYNC_ENGINE_PLAN.md`.

Deferred rather than blocking this baseline: physical iPhone, iPadOS, Android,
Firefox, and mobile-hardware performance runs.

Do not mark the local web phase 0 gate approved until these external results
are recorded. Provider-neutral sync-ready data work may proceed here, but
provider-specific schema and engine choices must follow the separate gate in
`docs/SYNC_ENGINE_PLAN.md`.

## Reference: PowerSync Browser VFS Spike

The disposable probe is available through `bun run spike:powersync`. It uses
the current browser migration manifest and runs the same migration, query,
`RETURNING`, transaction rollback, reload, and close contract against
PowerSync 2.3.1 with both `AccessHandlePoolVFS` and `OPFSCoopSyncVFS`:

- In the Chromium-compatible local browser, all 13 migrations applied on the
  first load and all 13 were skipped after reopening the database.
- Both VFS choices preserved a row across reopen, supported `RETURNING`, and
  rolled back an intentional transaction failure.
- The run was cross-origin isolated and reported `persisted: false`, matching
  the no-sync baseline's localhost behavior.
- PowerSync's normal client schema is view-based and does not consume
  Budgie's Drizzle migration history automatically. The probe therefore used
  a local schema plus raw SQL tables to test whether the migration shape can
  be carried forward.
- `AccessHandlePoolVFS` is explicitly single-tab and is not the Safari/iOS
  choice. `OPFSCoopSyncVFS` is the documented cross-browser alternative, but
  its multi-tab behavior does not replace Budgie's one-active-tab coordinator.

This result is an input to the provider-neutral data-structure work, not a
PowerSync approval. The full PowerSync decision, including a real service,
raw-table and managed-view comparison, an authenticated write API, two
browser clients plus Electron, and current Safari/iOS/Android checks, is owned
by `docs/SYNC_ENGINE_PLAN.md`.

## Provider-Neutral Sync-Ready Data Structure

Complete for the current scope:

- Migration `0013_chilly_dorian_gray` adds stable public IDs, lifecycle
  timestamps, nullable tombstones, unique public-ID indexes, and metadata
  triggers to every syncable entity and relationship table.
- Existing rows receive deterministic `legacy:<table>:<id>` public IDs and
  lifecycle timestamps during migration.
- Shared services and legacy IPC adapters retain syncable rows as tombstones;
  active reads exclude them, and database triggers reject hard deletes.
- Existing integer relationships remain intact. Settings and desktop paths
  remain device-local; canonical public-key strategy and provider-specific
  ownership/schema decisions remain in `docs/SYNC_ENGINE_PLAN.md`.
- Migration, service, IPC, and full-suite regression coverage passes with 339
  tests.

## Phase 2 Portable Data Package

Initial package core is implemented in `src/services/portable-data.ts`:

- Version 1 UTF-8 JSON data contract with manifest metadata and SHA-256
  checksum.
- Strict JSON serialization and parsing helpers verify the checksum at the
  interchange boundary.
- Explicit collections for every portable entity, including tombstoned rows.
- Relationships use stable public IDs rather than local integer IDs.
- The complete current `Preferences` shape is included provisionally.
- Preference account shortcuts use account public IDs in the package and are
  remapped to local IDs on import.
- `ApplicationAPI` now exposes platform-neutral portable export/import
  operations; Electron uses shared IPC services and the browser uses the same
  service contract directly.
- Structural, duplicate-ID, relationship, format-version, and checksum
  validation runs before database mutation.
- Atomic local overwrite uses dependency-ordered upserts and tombstones local
  rows absent from the imported package.
- Migrated SQLite coverage proves export, deterministic checksum generation,
  public-ID relationships, tombstone overwrite behavior, and checksum failure
  without mutation.

Phase 2 is complete for the current version-1 local-only package scope:

- Settings provides cross-platform JSON download and file-upload adapters with
  an explicit destructive-import confirmation.
- A checked-in empty-package golden fixture covers the version-1 wire format.
- Tests cover Electron/browser shared-service round trips, Unicode, malformed
  JSON, duplicate IDs, broken relationships, checksum corruption, tombstone
  overwrite behavior, and a 250-row export.
- There are no older supported package versions yet; future format versions
  must add explicit migration handlers and fixtures before release.

Hosted-account replacement semantics remain deferred to
`docs/SYNC_ENGINE_PLAN.md`.

Next resume point: Phase 3 Browser Runtime, continuing with browser restart,
offline navigation, service-worker update, quota, private-browsing, and
deployment validation in Chromium and Safari.

## Phase 4 Local Implementation Status

Completed in the repository:

- Added an explicit `build:web` boundary and generated-build verification.
- Added production CSP, frame, referrer, permissions, MIME, and isolation
  headers through the Vite preview path.
- Removed inline production scripts and moved theme initialization into React.
- Generated a versioned service-worker precache containing the HTML, hashed
  JavaScript, CSS, fonts, worker, WASM, manifest, and icons.
- Added user-confirmed service-worker activation and reload behavior.
- Added generated manifest/asset checks, offline route coverage, update-flow
  coverage, and production-preview header assertions.
- Added artifact retention and Cloudflare Pages preview/tag deployment
  workflows; credentials, project variables, Access policy, and DNS remain
  environment configuration.
- Added the current route/view/modal map at `docs/WEB_ROUTE_MAP.md`.

Manual Phase 4 acceptance is tracked in
`docs/PHASE4_MANUAL_CHECKLIST.md`. Phase 5 must not begin until that checklist
and product approval are complete.

## Guardrails

- Do not make WAL a shared domain assumption; journal mode belongs to each
  database adapter.
- Do not finalize sync-ready IDs, tombstones, or hosted schema from the
  no-sync probe.
- Do not keep the synthetic phase 0 HTML/worker harness in the production
  application once the findings are recorded.
