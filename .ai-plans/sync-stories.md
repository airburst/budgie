# Sync stories: delivery steps 1 to 6

Source: `.ai-plans/sync-engine.md` (referred to as "the plan"; § = section).
Covers freezing Electron, the spikes, the contract, the server and the web
client. BudgieMac (step 7), go-live (8), docs cleanup (9) and rollout (10) are
not here.

Conventions:

- Ids are `SY-nnn`. `Depends` lists stories that must be done first.
- Acceptance tags: `[unit]` Vitest unit, `[int]` Vitest integration
  (`createTestDb()` and/or the in-memory server), `[e2e]` Playwright Chromium,
  `[manual]` checked by hand, `[doc]` a written outcome.
- Every story ends with `bun run lint` and `bun run check-types` clean. Stories
  touching the web app also need `bun run verify:web` and `bun run test:e2e`.
- Stories that change `src/services` or `src/main/db` rebuild
  `public/services.js` / `public/db.js`.
- Every user-facing story adds a changeset (`minor` for the first sync UI
  story, `patch` after that).
- Status is `todo` unless stated.

## M1 Freeze Electron (step 1)

### SY-001 Stop Electron releases
As the maintainer, pushing a `v*` tag deploys the web app and no longer builds
or publishes Electron.
Depends: none
Acceptance:
- [manual] `.github/workflows/release.yml` no longer runs on tag pushes (kept
  as manual `workflow_dispatch` only, with a comment saying why).
- [manual] `web-deploy.yml` is unchanged and still deploys production on a
  `v*` tag after its own checks.
- [doc] `docs/RELEASE_RUNBOOK.md` describes a web-only release.
Status: done

### SY-002 Mark Electron as deprecated
As a reader of the repo, I can see that Electron is frozen, gets no new
features and will not get sync.
Depends: none
Acceptance:
- [doc] `README.md` and `docs/ARCHITECTURE.md` say Electron is frozen and name
  BudgieMac and the web PWA as the supported apps.
- [doc] `docs/BACKLOG.md`: Electron-only items (auto-update feed, hard-coded
  export version, mac + Windows release gating) are marked "won't do".
- [doc] `CLAUDE.md` gets a short note: Electron code and its tests stay, IPC
  parity is still required for existing channels, new features need no
  Electron wiring. (The full rules cleanup is step 9.)
Status: done

## M2 Spikes (step 2)

Spikes produce a decision written into the plan, not shipped code. Prototype
code lives outside the repo or is deleted.

### SY-003 Spike: can D1 do a push in one batch?
As the maintainer, I know whether the server runs on D1 or on a Durable
Object per user.
Depends: none
Acceptance:
- [doc] A prototype on a real D1 database (EU jurisdiction) runs one
  `batch()` that bumps `users.seq`, upserts 500 envelopes from `json_each`
  only where the incoming `hlc` is higher, and selects a pull page.
- [doc] Recorded: whether rejected envelopes can be reported from the same
  batch; rows read and written per 500-row push (indexes count as writes);
  the largest request body and statement size that worked.
- [doc] Recorded: the pull cursor design. If one push gives all its rows the
  same `seq`, the cursor must page by more than `seq` alone.
- [doc] Decision written into plan §2 and §3: D1, or Durable Object, with the
  reason. "Unresolved questions" updated.
Status: done (2026-11-22). D1. All checks passed on a real EU D1 database and
on local `wrangler dev`: one four-statement batch; rejected rows derived from
`RETURNING`; compound cursor `(seq, tbl, public_id)`; `WITHOUT ROWID` cuts
billed writes from 3 to 2 per row; 500 typical rows is about 160 KB, a 2.6 MB
parameter worked, 10 MB failed. The throwaway Worker and database are deleted.

### SY-004 Spike: celld as the local stack
As the maintainer, I know whether dev and e2e run the server on celld or on
`wrangler dev`.
Depends: SY-003
Acceptance:
- [doc] The SY-003 prototype runs on celld from the same wrangler config,
  with local D1, a local R2 bucket and a cron trigger fired by hand.
- [doc] Any behaviour that differs from real Cloudflare is listed.
- [doc] Recorded: how to start it headless for Playwright, and how to reset
  its data between runs.
- [doc] Decision written into plan §2: celld or `wrangler dev`.
Status: done (2026-11-22). celld 0.6.3. The SY-003 Worker ran unchanged with
local D1 and R2 and passed every check; a cron handler fired on schedule.
Differences and usage are in plan §2. Not checked: an R2 binding that sets
`jurisdiction`, because R2 is not enabled on the account yet.

### SY-005 Spike: Cloudflare account facts
As the maintainer, I know the hosting choices in the plan fit the free plan
and the EU.
Depends: none
Acceptance:
- [doc] Confirmed and recorded: D1 and R2 can both be created in the EU
  jurisdiction on the free plan; R2's free storage and operation allowance;
  cron triggers on the free plan; D1 Time Travel retention.
- [doc] Confirmed: `sync.fairhursts.net` can be bound to the Worker, and a
  staging hostname is chosen.
- [doc] Anything that does not fit is raised as a change to the plan.
Status: done (2026-11-22). Hostname decided: the Worker's `workers.dev`
address, because the domain's DNS stays at GoDaddy (plan §2). Confirmed on the
free plan: D1 in the EU jurisdiction (region EEUR); an R2 bucket in the EU
jurisdiction, used from a Worker binding; R2 allowance of 10 GB, 1 million
writes and 10 million reads a month; 5 cron triggers per account; Time Travel
keeps 7 days. Raised as changes to the plan: `fairhursts.net` is not a
Cloudflare zone, so `sync.fairhursts.net` cannot be bound; the free plan allows 10 ms of CPU per request, which
the snapshot job must be measured against; celld needs its own config without
`jurisdiction` and `workers_dev`.

## M3 Contract (step 3)

Lives in `sync-server/contract/`. BudgieMac will build against it later, so
it must stand alone without reading Budgie's source.

### SY-006 Write the contract spec
As the author of either engine, I can implement sync from `SPEC.md` alone.
Depends: SY-003
Acceptance:
- [doc] `SPEC.md` defines: the envelope; the payload for each of the 10
  tables (field, type, nullability, foreign keys as public ids); that
  `pendingReconcileBalance` and `pendingReconcileDate` are never sent; that
  unknown payload fields are ignored on apply.
- [doc] Defines the HLC string format, comparison, the seal rule, and the
  5-minute drift limit.
- [doc] Defines pure last-write-wins including delete and undelete, table
  apply order, and the second pass for category parents and transfer links.
- [doc] Defines every endpoint in plan §3 and §13 with request, response and
  error codes (bad token, revoked, drift, version, daily limit, bad code).
- [doc] States the format version (1) and the rule for bumping it.
- [unit] A test checks that every `Portable*` row type in
  `src/services/portable-data.ts` matches the spec's field list for its table,
  so the two cannot drift silently.
Status: done

### SY-007 Define the conformance fixture format
As the author of either engine, I can run the same merge cases and get a
pass or fail.
Depends: SY-006
Acceptance:
- [doc] `fixtures/README.md` describes one fixture: starting local rows,
  incoming envelopes, expected local rows, expected outgoing envelopes, and
  the clock and device id to use.
- [unit] A JSON schema validates every file in `fixtures/`.
- [unit] First fixtures exist for: newer remote wins; older remote ignored;
  equal `hlc` ignored; remote delete; remote undelete beats older delete;
  local dirty row sealed and pushed.
- [doc] `contract/VERSION` holds the contract version that BudgieMac's copy
  script will record.
Status: todo

### SY-008 Deterministic ids for auto-posted transactions
As a user with two devices, a scheduled payment that both devices post
becomes one transaction, not two.
Depends: SY-006
Acceptance:
- [doc] `SPEC.md` defines the function: inputs (schedule public id, due date,
  leg marker for transfers), hash, and how the bytes become a UUID.
- [unit] `src/services/sync/ids.ts` implements it; `fixtures/ids.json` holds
  at least 10 input and output vectors and the test runs them all.
- [unit] Output is a valid lowercase UUID and differs between the two legs of
  a transfer.
Status: todo

### SY-009 Decide the natural-key collision rule
As the author of either engine, I know exactly what happens when two devices
create the same payee, envelope link or monthly allocation offline.
Depends: SY-007
Acceptance:
- [int] First, the suspected existing bug is settled: with a deleted row
  holding the key, creating the same payee name, envelope category or
  `(envelope, month)` allocation through the services either works or is
  fixed. Result noted in the plan.
- [doc] `SPEC.md` states the rule for `payees.name`,
  `envelope_categories.category_id` and `budget_allocations(envelope_id,
  month)`, including what happens to the losing public id on the device, on
  the server and on a third device. The plan's proposal (re-key the local row
  to the winner) is confirmed or replaced.
- [unit] Fixtures cover, for each of the three tables: collision where local
  wins; where remote wins; where the losing row was already pushed; where the
  key is held by a deleted row.
- [doc] Plan §6 and "Unresolved questions" updated.
Status: todo

## M4 Server (step 4)

Code in `sync-server/`. Handler tests run on in-memory better-sqlite3 through
the executor interface.

### SY-010 Scaffold the sync server
As the maintainer, I have a Worker project that builds, tests and runs
locally.
Depends: SY-003, SY-004
Acceptance:
- [unit] `sync-server/` has its own `package.json`, wrangler config (EU
  jurisdiction for D1 and R2) and a batch-shaped SQL-executor interface with
  two implementations: D1 and better-sqlite3.
- [unit] A schema migration creates `users`, `devices`, `changes` (with the
  `(user_id, seq)` index) and an `invites`/codes table; the same SQL runs on
  both executors.
- [unit] `GET /v1/health` returns the contract version.
- [manual] The server starts on the local stack chosen in SY-004.
- [manual] Root `bun run lint`, `bun run check-types` and `bun run test`
  cover `sync-server/`; CI (`web-platform.yml`) runs them.
Status: done. Layout and decisions in `sync-server/README.md`. [manual] check
  run: celld 0.6.3 served `/v1/health` on a free port from `wrangler.local.jsonc`
  (celld reads `.jsonc`, not `.toml`). Root lint, types and tests cover
  `sync-server/` (vitest project `sync-server`, eslint node globals); CI already
  runs them. The `(user_id, seq)` index is `(user_id, seq, tbl, public_id)` per
  plan section 3.

### SY-011 Create users and invites
As the operator, I can create a user and hand them a one-time invite code.
Depends: SY-010
Acceptance:
- [unit] `add-user <name>` creates the user and prints an invite code once;
  only its hash is stored, with an expiry.
- [unit] `new-invite <user>` issues another code for an existing user.
- [unit] Codes are single use and expire; the script never prints a code
  that is already stored.
- [manual] Both scripts work against the local stack and a remote database.
Status: done except the remote half of the [manual] check, which was not run
(no Cloudflare access). Both scripts were run against wrangler's local D1;
they cannot reach the D1 of a running `celld dev` (see `sync-server/README.md`).

### SY-012 Enrol the first app with an invite
As a user, I enter my invite code and my app is connected to my account.
Depends: SY-011
Acceptance:
- [unit] `POST /v1/enrol` with a valid invite and a device name creates a
  device, returns a device token once, and returns `hasData` (whether the
  user already has rows) so the app can choose Start or Join.
- [unit] Only the SHA-256 of the token is stored.
- [unit] A used, expired or unknown code returns the same error and creates
  nothing.
- [unit] Attempts are rate-limited per IP and per user; codes never appear in
  logs.
Status: done, with two deviations from the story text. Rate limiting is per IP
only (failed attempts, 10 per 15 minutes, counted in D1 table `rate_limits`),
because SPEC 2.5 limits `POST /v1/enrol` per IP and a failed code has no user
to count against. The device-code half of enrol is SY-015. Logging beyond
"codes never appear in logs" is SY-018.

### SY-013 Push changes
As a device, I send my changed rows and the server keeps the newest version
of each.
Depends: SY-012, SY-006
Acceptance:
- [unit] `POST /v1/sync` resolves user and device from the bearer token only;
  a missing, unknown or revoked token is rejected.
- [unit] An envelope is stored only when its `hlc` is higher than the stored
  one; a lower or equal one is reported in `rejected` with reason `stale`.
- [unit] A delete followed by a higher-`hlc` undelete leaves the row
  undeleted; the reverse leaves it deleted.
- [unit] An `hlc` more than 5 minutes ahead of server time is rejected with
  reason `drift`; the rest of the batch is still applied.
- [unit] One user's push never reads or writes another user's rows, even with
  the same `tbl` and `publicId`.
- [unit] Each accepted row gets a `seq` higher than any earlier row for that
  user; the payload is stored byte for byte.
- [unit] A newer `formatVersion` in the request is accepted.
Status: done. The handler runs the whole four-statement batch, including the
pull page (tested under SY-014). Not covered: body cap and 500-envelope limit
(SY-018), `last_seen_at` update (SY-016). The batch was also run on celld
0.6.3 (650-row push, `json_each` upsert with `RETURNING`, row-value cursor
paging); not yet on real D1 or staging.

### SY-014 Pull changes
As a device, I receive every row other devices changed since my cursor.
Depends: SY-013
Acceptance:
- [unit] The response holds rows after the cursor written by other devices,
  never the caller's own writes.
- [unit] With more rows than a page, `more` is true and repeating with the
  returned cursor yields every row exactly once, including when many rows
  share a `seq`.
- [unit] A row changed between two pages is not lost.
- [unit] Cursor 0 returns the user's whole data set (used by Join).
- [unit] A push and a pull in the same request work together.
Status: todo

### SY-015 Add a device from an enrolled one
As a user, I connect a second app by entering a short code shown on my first.
Depends: SY-012
Acceptance:
- [unit] `POST /v1/devices/code` (authenticated) returns a short code valid
  for about 10 minutes, single use, stored hashed.
- [unit] `POST /v1/enrol` accepts that code and returns a new device token
  for the same user.
- [unit] An expired, used or wrong code fails with the same error as SY-012
  and is rate-limited the same way.
- [unit] A revoked device cannot request a code.
Status: todo

### SY-016 List and revoke devices
As a user, I can see which apps are connected and disconnect any of them.
Depends: SY-012
Acceptance:
- [unit] `GET /v1/devices` returns the caller's devices (id, name, created,
  last seen, whether it is the caller) and nobody else's.
- [unit] `DELETE /v1/devices/:id` revokes a device of the same user; its
  token stops working at once; another user's device id returns not found.
- [unit] A device can revoke itself (used by "Sign out").
- [unit] `revoke-device` admin script does the same.
Status: todo

### SY-017 Delete a user's cloud data
As a user, I can remove everything the server holds about my finances.
Depends: SY-013, SY-019
Acceptance:
- [unit] `DELETE /v1/data` removes the caller's `changes` rows and R2
  snapshots, resets `users.seq` handling so a later Start sync works, and
  leaves the user and devices in place.
- [unit] Another user's data is untouched.
- [unit] `delete-user-data` admin script does the same and can also remove
  the user and devices.
- [doc] The response and the spec state that D1 Time Travel may retain data
  for up to 7 days.
Status: todo

### SY-018 Limits, CORS and logging
As the operator, the server refuses abuse and never logs financial data.
Depends: SY-013
Acceptance:
- [unit] Requests over the body cap or over 500 envelopes are refused with a
  clear error code.
- [unit] CORS allows `https://budget.fairhursts.net` (plus the local dev
  origin in dev only); other origins get no CORS headers.
- [unit] Log lines hold user id, device id, counts and reasons; a test
  asserts no payload, token or code text appears in them.
- [unit] A D1 daily-limit failure is returned as a distinct retryable error.
- [unit] A per-IP request limit is enforced inside the Worker on every
  route (there is no Cloudflare zone to hold a rate-limit rule); over the
  limit returns a distinct retryable error. The README records the limits.
Status: todo

### SY-019 Daily snapshots to R2
As a user, a copy of my data from each of the last 30 days exists, so a bad
edit that synced can be undone.
Depends: SY-013
Acceptance:
- [unit] The scheduled handler writes `snapshots/<user>/<date>.json` for each
  user with data: a portable data package (format 1) built from `changes`
  payloads grouped by table, with manifest and checksum.
- [int] The snapshot passes the existing portable import validation in
  `src/services/portable-data.ts` and imports into a `createTestDb()`
  database with the same rows.
- [unit] `preferences` is `{}`; pending reconcile fields are null; deleted
  rows keep their `deletedAt`.
- [unit] Snapshots older than 30 days are removed in the same run; a user
  with no changes since the last snapshot still gets one.
- [unit] One user's failure does not stop the others; failures are logged
  without payloads.
Status: todo

### SY-020 Fetch a snapshot
As the operator, I can list a user's snapshots and download one as a file
that Budgie or BudgieMac can import.
Depends: SY-019
Acceptance:
- [unit] `list-snapshots <user>` prints dates and sizes.
- [unit] `get-snapshot <user> <date>` writes the JSON file unchanged.
- [manual] A downloaded snapshot imports in the web app.
Status: todo

### SY-021 Deploy a staging server
As the maintainer, the server runs on Cloudflare as `budgie-sync-staging`
on its `workers.dev` address.
Depends: SY-013, SY-014, SY-018, SY-019
Acceptance:
- [manual] Staging Worker, D1 database and R2 bucket exist in the EU
  jurisdiction; migrations are applied by a documented command.
- [manual] Enrol, push, pull and a hand-fired snapshot all work against
  staging with a test user.
- [doc] `sync-server/README.md` covers local run, tests, deploy, migrations,
  admin scripts and restoring from Time Travel.
- [doc] Production (`budgie-sync`) is not created here; that is go-live
  (step 8).
Status: todo

## M5 Web engine (step 5)

Code in `src/services/sync/`, over `DatabaseCapability`. No UI in this
milestone.

### SY-022 Migration 0014: sync columns, triggers and state
As the engine, I can tell which rows changed locally and keep my own writes
from looking like user edits.
Depends: SY-006
Acceptance:
- [int] Hand-written migration adds `hlc` and `sync_dirty` to the 10 synced
  tables, and a single-row `sync_state` table (device id, server URL, token,
  cursor, last synced, last error, enabled, consent date and app version).
  No `DROP TABLE`.
- [int] The ten `*_sync_metadata_update` triggers from 0013 are dropped and
  recreated so they skip engine writes.
- [int] Trigger behaviour: a local insert or update sets `sync_dirty = 1` and
  bumps `updated_at`; sealing (`hlc` only) changes neither `updated_at` nor
  dirtiness; ack (`sync_dirty = 0`) sticks; a remote apply leaves
  `sync_dirty = 0` and the payload's `updated_at`, including when it equals
  the old value.
- [int] New rows get a canonical lowercase UUID public id (the 0013 triggers
  create 32 hex digits without hyphens); existing ids are left for Start.
- [int] "Edited since sealed" is recorded separately from dirty (for example
  a change counter), so an edit made while a push is in flight is not
  acknowledged away (SPEC.md §8.3).
- [int] Runs on a fresh database and on one upgraded from 0013 with data;
  the web migration bundle includes it.
- [manual] Manual migration checklist followed (journal, snapshot, rebuild
  `public/db.js`, fresh-DB test).
Status: todo

### SY-023 Hybrid logical clock
As the engine, I can order two versions of a row from different devices.
Depends: SY-006
Acceptance:
- [unit] `hlc.ts` encodes, parses and compares per the spec; string order
  equals logical order.
- [unit] Seal rule: result is the larger of "from `updated_at`" and
  "increment of the row's current `hlc`"; a row edited after a remote apply
  always gets a higher `hlc` than the applied one.
- [unit] Ties in the same second on two devices are broken by counter, then
  device id.
Status: todo

### SY-024 One row codec for export, import and sync
As the maintainer, portable export, portable import and sync all read and
write rows through the same per-table functions.
Depends: SY-006
Acceptance:
- [int] `portable-data.ts` exposes `toPortableRow` and `applyPortableRow` per
  table (upsert by `public_id`, foreign keys resolved from public ids).
- [int] Existing portable data tests pass unchanged, and an export of the
  fixture database is byte-identical before and after the refactor.
- [unit] The sync codec omits the two pending reconcile fields on encode and
  leaves the local values untouched on apply.
- [unit] `applyPortableRow` ignores unknown fields (BudgieMac files carry
  `bankText`).
- [unit] Applying a row whose referenced parent is missing fails with a named
  error rather than writing a broken link.
Status: todo

### SY-025 Importing a snapshot keeps my preferences
As a user, restoring from a server snapshot does not reset my settings.
Depends: SY-024
Acceptance:
- [int] Portable import with `preferences: {}` leaves the existing settings
  row unchanged; with non-empty preferences it behaves as today.
- [int] Account shortcuts that no longer resolve after such an import are
  dropped, the rest remapped by public id.
Status: todo

### SY-026 Run one sync cycle
As a user with sync enabled, my changes reach the server and other devices'
changes reach me.
Depends: SY-013, SY-014, SY-022, SY-023, SY-024, SY-007
Acceptance:
- [int] A test harness runs 2 to 3 `createTestDb()` clients against the
  in-memory server, with a controllable clock per client.
- [int] Cycle: seal dirty rows, push in chunks of at most 500, fetch until
  `more` is false, apply the whole pull in one transaction in dependency
  order, store the cursor in that transaction, clear `sync_dirty` only where
  the `hlc` still matches what was sent.
- [int] Scenarios pass: offline edits to different rows on two devices; the
  same row edited on both (higher `hlc` wins on both); delete vs edit;
  delete then revive; a child row arriving a page before its parent; a row
  edited locally while its push is in flight stays dirty.
- [int] A push that fails mid-way and is retried leaves no duplicates and no
  lost rows; a failed apply rolls back and leaves the cursor unchanged.
- [unit] The engine runs every fixture in `sync-server/contract/fixtures/`.
- [int] The cycle returns counts per table of rows applied and pushed.
Status: todo

### SY-027 Keep transfer pairs whole
As a user, a transfer never ends up with one side missing after a sync.
Depends: SY-026
Acceptance:
- [int] Both legs of a transfer are sealed and pushed in the same request.
- [int] Create, edit and delete a transfer on one device; the other device
  ends with both legs linked, or both deleted.
- [int] One device deletes a transfer while another edits one leg: after
  sync both devices agree, and no leg is left without its partner.
- [unit] A fixture covers "one leg deleted remotely".
Status: todo

### SY-028 Auto-post the same occurrence once
As a user, two devices that both auto-post a scheduled payment end up with
one transaction.
Depends: SY-008, SY-026
Acceptance:
- [int] `processAutoPost` creates transactions with the deterministic id from
  SY-008 (both legs for a scheduled transfer).
- [int] Two clients auto-post the same occurrences offline, then sync: each
  has exactly one transaction per occurrence and the schedule's next due
  date agrees.
- [int] A user who deleted an auto-posted transaction does not get it back
  when another device posts the same occurrence with an older `hlc`.
- [int] Existing auto-post tests still pass.
Status: todo

### SY-029 Resolve natural-key collisions
As a user, creating the same payee or budget entry on two devices offline
merges cleanly instead of failing the sync.
Depends: SY-009, SY-026
Acceptance:
- [int] The engine implements the rule from SY-009 for payees, envelope
  categories and budget allocations; all SY-009 fixtures pass.
- [int] Two clients create the same payee name offline, sync in either
  order, and end with one live payee and identical rows.
- [int] The same for an envelope category and for a monthly allocation.
- [int] An apply never aborts on a unique constraint.
Status: todo

### SY-030 Flag reconciliations that no longer add up
As a user, I am told when a sync changed transactions I had already
reconciled.
Depends: SY-026
Acceptance:
- [int] After each apply, for every account the reconciled total is compared
  with its latest reconciliation balance; mismatches are returned by the
  cycle as accounts needing review.
- [int] Reconcile on one device while another edits an included transaction
  offline: after sync the account is flagged on both.
- [int] Nothing is repaired automatically; a flag clears when the totals
  agree again.
Status: todo

### SY-031 Start sync on the first app
As a user, turning sync on uploads all my data.
Depends: SY-026
Acceptance:
- [int] Start rewrites every public id that is not a canonical UUID
  (`legacy:*` and the 32-hex ids from 0013) to a fresh UUID in one
  transaction, keeping every foreign key and transfer link intact, then marks
  every row dirty.
- [int] After the first cycle the server holds every row, including deleted
  ones, and no id on the server is a non-UUID.
- [int] Start refuses when the server already has data for the user
  (`hasData`), pointing to Join instead.
- [int] An interrupted first upload resumes and completes.
Status: todo

### SY-032 Join sync on a later app
As a user, connecting another app replaces its data with my synced books.
Depends: SY-026, SY-029
Acceptance:
- [int] Join removes local data from view (rows marked deleted, not dirty),
  pulls from cursor 0 and applies it; the result equals the first device's
  data row for row.
- [int] Nothing from the joining device's old data is ever pushed.
- [int] Works when the joining device has rows whose natural keys match
  server rows (same payee names, same envelope links).
- [int] Account shortcuts are remapped by public id; ones that do not
  resolve are dropped. Other preferences are kept.
- [int] A failed join leaves the device's data as it was.
Status: todo

### SY-033 Handle sync errors
As a user, a failed sync tells me what is wrong and loses nothing.
Depends: SY-026
Acceptance:
- [int] A pull with a newer format version is not applied; status becomes
  "update needed" and local data is untouched.
- [int] Revoked or unknown token: syncing stops, status says the device was
  disconnected, local data stays.
- [int] Offline or a server error: status is "offline" or "error", dirty rows
  stay dirty, the next cycle retries.
- [int] Drift rejection and the daily-limit error each produce their own
  status; a drift-rejected row stays dirty.
- [int] `last_error` and `last_synced_at` in `sync_state` reflect each case.
Status: todo

### SY-034 Portable import while synced
As a user, importing a data file while sync is on updates my other devices
too.
Depends: SY-026, SY-025
Acceptance:
- [int] After a portable import on a synced device, every imported row is
  dirty with an `hlc` newer than anything previously synced, and rows the
  import removed are pushed as deleted.
- [int] A second device ends with exactly the imported data after sync.
- [int] Importing a server snapshot (SY-019) while synced works the same way.
Status: todo

## M6 Web wiring and UI (step 6)

UI uses the existing shadcn Base UI components in `src/components/ui/`.

### SY-035 Sync methods on the application API
As the web app, I can drive sync through `window.api`.
Depends: SY-026, SY-031, SY-032, SY-033
Acceptance:
- [unit] `ApplicationAPI` gains: get status, enrol (code, device name,
  consent), start, join, sync now, disable, sign out, delete cloud data, list
  devices, revoke device, create device code. Implemented in
  `src/platform/browser-api.ts`.
- [unit] Status includes: enabled, state (synced, pending, offline, error,
  update needed, disconnected), pending count, last synced, last error,
  accounts needing reconciliation review.
- [unit] Electron reports sync as unsupported; no IPC channels are added.
- [unit] Only the tab holding the instance lock can call the mutating
  methods.
Status: todo

### SY-036 Let the web app reach the sync server
As the web app, my requests to the sync server are allowed and never cached.
Depends: SY-021
Acceptance:
- [unit] `vite.config.ts` adds the sync origin to `connect-src` in both
  header blocks; `bun run verify:web` checks for it.
- [e2e] `sw.js` does not intercept or cache requests to the sync origin.
- [manual] A request from `budget.fairhursts.net` preview to staging passes
  CORS and CSP.
Status: todo

### SY-037 Turn sync on, with consent
As a user, I choose to send my data to the cloud knowing what that means,
and connect with my code.
Depends: SY-035, SY-036
Acceptance:
- [e2e] Settings has a Sync section, off by default; before it is turned on
  the app makes no request to the sync origin.
- [e2e] The consent screen states what is uploaded, where (Cloudflare, EU),
  that snapshots are kept 30 days, that the operator can read the data, and
  how to stop or delete. Nothing proceeds until it is confirmed.
- [e2e] After consent I enter a code and a device name. With no data on the
  server I am offered Start; with data, Join, with a warning that this
  device's data will be replaced and a "Download backup" button first.
- [e2e] A wrong or expired code shows a clear message and changes nothing.
- [int] Consent date and app version are stored in `sync_state`.
- [doc] In-app wording and `docs/ARCHITECTURE.md` no longer claim there is
  no server.
Status: todo

### SY-038 Sync now and see the status
As a user, I can sync on demand and see whether I am up to date.
Depends: SY-037
Acceptance:
- [e2e] The Sync section shows last synced time, pending change count and
  the last error, and has a "Sync now" button that shows progress.
- [e2e] The header shows a small indicator: synced, pending N, offline,
  error. It is absent when sync is off.
- [e2e] After a sync that applied rows, open pages show the new data without
  a reload.
- [e2e] Works at phone width.
Status: todo

### SY-039 Sync in the background
As a user, my devices stay up to date without me pressing anything.
Depends: SY-038
Acceptance:
- [unit] Sync runs on app start, on window focus, on `online`, about 5
  seconds after a local write (debounced), and every 5 minutes while open.
  Never two cycles at once.
- [int] On start with sync enabled and online, sync runs before auto-post
  (`src/web/runtime/runtime.ts`), with a short timeout so an unreachable
  server does not block startup; offline, auto-post runs as today.
- [unit] A tab without the instance lock never syncs.
- [e2e] An edit shows as "pending 1", then "synced" without user action.
Status: todo

### SY-040 Add and manage devices
As a user, I can connect another app and disconnect ones I no longer use.
Depends: SY-037, SY-015, SY-016
Acceptance:
- [e2e] "Add a device" shows a short code with its expiry.
- [e2e] The device list shows each app's name, when it was added and last
  seen, and marks this one; any other can be revoked after confirmation.
- [e2e] A second browser context enrols with the code and joins.
Status: todo

### SY-041 Stop, sign out, or delete my cloud data
As a user, I can stop syncing, disconnect this app, or erase the cloud copy,
and I can tell the three apart.
Depends: SY-037, SY-017
Acceptance:
- [e2e] "Disable on this device" stops syncing and keeps local data, the
  token and the cloud copy; it can be turned back on without a code.
- [e2e] "Sign out this device" also revokes and removes the token; turning
  sync on again needs a new code.
- [e2e] "Delete my cloud data" needs a typed confirmation, removes the
  server copy and snapshots, keeps local data, turns sync off on this
  device, and says other devices will stop syncing and that copies may
  persist for up to 7 days.
- [int] After delete, Start sync from any device works again.
Status: todo

### SY-042 Download a backup
As a user, I can save a full copy of my data to a file at any time.
Depends: SY-037
Acceptance:
- [e2e] The Sync section has "Download backup", which produces the existing
  portable export.
- [e2e] The same button is offered before Join and before a portable import
  while synced.
- [e2e] Portable import while synced warns that it will overwrite all
  devices before proceeding.
Status: todo

### SY-043 Tell me about sync problems
As a user, I am told when sync needs my attention.
Depends: SY-038, SY-030, SY-033
Acceptance:
- [e2e] Toasts appear for: device clock too far ahead; app too old to sync;
  this device was disconnected; daily limit reached (will retry). Each
  appears once per occurrence, not on every cycle.
- [e2e] An account whose reconciliation no longer adds up after a sync shows
  a "review reconciliation" notice linking to that account.
Status: todo

### SY-044 End-to-end test against a local server
As the maintainer, CI proves the web app syncs through a real server.
Depends: SY-039, SY-040
Acceptance:
- [e2e] Playwright starts the local server stack (SY-004) with a fresh
  database and a seeded user and invite.
- [e2e] Context A: consent, enrol, Start, add a transaction. Context B:
  enrol with a device code, Join, see the transaction, edit it. A sees the
  edit after a sync. Reloading either keeps the state.
- [e2e] The run is part of `bun run test:e2e` and CI.
Status: todo

### SY-045 Seed the PWA from a BudgieMac export
As the maintainer, I can test sync on my phone with real data before the Mac
client exists.
Depends: SY-037, SY-021
Acceptance:
- [int] A BudgieMac export fixture (with `bankText` and
  `budgieMacImportRules`) imports into the web database; unknown keys are
  ignored; public ids stay the Mac's UUIDs.
- [manual] On a phone: import a real BudgieMac export into the installed
  PWA, Start sync against staging, confirm the row counts on the server.
- [manual] A second browser joins and matches. This staging data is test
  data only and is deleted before go-live.
Status: todo
