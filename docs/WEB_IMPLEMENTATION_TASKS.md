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
- [ ] Compare the no-sync baseline with the PowerSync browser VFS spike using
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

- [ ] Choose and document the browser database adapter behind a shared
      asynchronous capability interface.
- [x] Bundle the existing migration SQL for browser loading without
      filesystem-based discovery.
- [x] Execute bundled migrations in a browser database and verify fresh and
      upgrade paths.
- [ ] Create a dedicated database worker with serialized commands and explicit
      startup failure states.
- [ ] Add origin-wide Web Lock and BroadcastChannel inactive-tab handling.
- [ ] Add persistent-storage requests and distinct OPFS, quota, corruption,
      migration, and private-browsing errors.
- [ ] Extract shared domain services before wiring browser RPC.
- [ ] Add contract tests that execute against Electron and browser adapters.
- [x] Add a migration metadata contract test using the real Electron Drizzle
      migrator and browser executor.
- [x] Add physical WAL-enabled Electron database-file coverage for migration
      metadata compatibility.

## Phase 0 Approval Status

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
- The disposable PowerSync browser VFS comparison and its sync decision gate.

Deferred rather than blocking this baseline: physical iPhone, iPadOS, Android,
Firefox, and mobile-hardware performance runs.

Do not mark phase 0 approved or begin sync-ready schema changes until these
external results are recorded. The next implementation work can proceed on
the platform-neutral adapter interfaces, but it must preserve this gate.

## Guardrails

- Do not make WAL a shared domain assumption; journal mode belongs to each
  database adapter.
- Do not finalize sync-ready IDs, tombstones, or hosted schema from the
  no-sync probe.
- Do not keep the synthetic phase 0 HTML/worker harness in the production
  application once the findings are recorded.
