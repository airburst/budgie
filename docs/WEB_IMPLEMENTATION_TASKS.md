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

- [ ] Run the same contract against representative iPhone, iPad, Android,
  Firefox, and Chromium versions.
- [ ] Measure startup, migration, bulk import, reporting queries, and a large
  transaction dataset on representative hardware.
- [ ] Test persistence across reload, browser restart, PWA installation, and
  storage pressure; record quota, private browsing, and denied-persistence
  behavior.
- [ ] Validate WASM and worker loading on localhost, Cloudflare preview, and
  offline service-worker mode.
- [ ] Compare the no-sync baseline with the PowerSync browser VFS spike using
  the same contract before changing the production schema.

## First Production Slice

- [ ] Choose and document the browser database adapter behind a shared
  asynchronous capability interface.
- [ ] Move schema and bundled migrations into a browser-loadable form without
  filesystem-based migration discovery.
- [ ] Create a dedicated database worker with serialized commands and explicit
  startup failure states.
- [ ] Add origin-wide Web Lock and BroadcastChannel inactive-tab handling.
- [ ] Add persistent-storage requests and distinct OPFS, quota, corruption,
  migration, and private-browsing errors.
- [ ] Extract shared domain services before wiring browser RPC.
- [ ] Add contract tests that execute against Electron and browser adapters.

## Guardrails

- Do not make WAL a shared domain assumption; journal mode belongs to each
  database adapter.
- Do not finalize sync-ready IDs, tombstones, or hosted schema from the
  no-sync probe.
- Do not keep the synthetic phase 0 HTML/worker harness in the production
  application once the findings are recorded.