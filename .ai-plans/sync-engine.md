# Budgie Sync Engine Plan

Status: draft, revised 2026-11-22 after a review of both repos. Supersedes the
PowerSync recommendation in `docs/SYNC_ENGINE_PLAN.md`.

Clients: **BudgieMac** (`../budgie-mac`, SwiftUI + SwiftData, the daily driver)
and the **web PWA** on mobile. The Electron app is frozen and gets no sync.

> **The contract is now the source of truth for wire and merge rules:**
> `sync-server/contract/SPEC.md` (SY-006). Where this plan and the spec
> differ, the spec wins. Points where the spec changed or tightened the plan:
>
> - The web app's 0013 triggers create 32-hex public ids, not UUIDs.
>   Migration 0014 must make new ids canonical UUIDs, and Start rewrites every
>   non-UUID id, not only `legacy:*`.
> - `sync_dirty = 1` cannot tell that a row was edited again while its push
>   was in flight (a local edit does not change `hlc`). 0014 must record
>   "edited since sealed" separately, for example as a change counter.
> - A delete carries the full row, so BudgieMac's `Tombstone` must keep the
>   last payload, not only `(table, uuid, hlc, dirty)`.
> - "Delete my cloud data" bumps a per-user data epoch carried in the cursor;
>   other devices get `data_reset` and stop syncing.
> - The server tracks the highest format version per user and refuses older
>   clients with `format_too_old`.
> - Server tables gain `users.max_format_version`, `users.data_epoch`,
>   `devices.last_seen_at` and an `enrol_codes` table.

## 1. Decisions already made

Scope and platforms:

- Per-user storage; 1 user now, 3 eventually. No shared books.
- Targets are Mac (BudgieMac) and mobile (web PWA) only. No Windows.
- Electron is frozen now: no more releases, no sync wiring. Its code is not
  removed as part of this work (the integration suite still runs on
  `public/ipc` and better-sqlite3).
- Two engines: TypeScript (web) and Swift (BudgieMac), built in that order
  against one written contract.

Protocol and merge:

- Whole-row last-write-wins, ordered by a row-level hybrid logical clock (HLC).
- **Pure LWW.** `deleted` is just another field: the highest HLC wins, so a
  later undelete beats an earlier delete. There is no "tombstone always wins"
  rule. (Needed because `envelopes.ts` revives tombstoned
  `envelope_categories` rows.)
- **Public ids are UUIDs everywhere.** No `legacy:*` or `auto:*` strings on the
  wire. BudgieMac stores ids as `UUID` and cannot echo other strings.
- Row payloads reuse the portable export row shapes (`Portable*` types in
  `src/services/portable-data.ts`), exchanged as deltas.
- `pendingReconcileBalance` and `pendingReconcileDate` are stripped from the
  sync payload. A half-finished reconciliation stays on its device.
- Mac-only data stays on the Mac: `Transaction.bankText`, `ImportRule`,
  `accountOrder`. Never on the wire; the Mac keeps its local values when it
  applies a remote row.
- Preferences (`settings`) stay per-device and are not synced.
- The client buffers every pull page and applies them in one local
  transaction.

Security and enrolment:

- HTTPS plus Cloudflare at-rest encryption. No end-to-end encryption.
- A user's first app is enrolled with an operator-issued invite code; further
  apps with a short code from an already-enrolled app (section 13).
- Data is stored in the EU jurisdiction.

Hosting and repo:

- Cloudflare Worker on its `workers.dev` address (section 2). Server code in
  `sync-server/`.
- The contract (spec + conformance fixtures) lives beside the server code.
- Repos stay separate. This repo owns the server, the contract and the TS
  engine. `budgie-mac` owns the Swift engine and copies the fixtures into
  `Tests/BudgieMacKitTests/Fixtures` with a script that records the contract
  version, so a stale copy fails a test.

Consent (section 13):

- Sync is off by default and opt-in per app. Nothing is sent to the sync
  origin until the user has confirmed a consent screen.
- A user can delete their cloud data from the app, not only via an admin
  script.
- Daily server-side snapshots to R2, in the portable data format (section 9).
- `sync_state` is exempt from the five-file entity CRUD rule.
- Manual "Sync now" plus background sync.

Deferred on purpose:

- Payee name collisions on the Mac (`@Attribute(.unique)` upserts silently).
  Review once the Swift engine exists and the real impact is visible.

## 2. Hosting and local development

- One Worker, one D1 database, one R2 bucket. No hardware.
- **D1, not a Durable Object** (spike SY-003, 2026-11-22): the whole sync
  request runs as one `batch()` on a real EU-jurisdiction D1 database.
- **R2 in the EU works on the free plan** (spike SY-005, 2026-11-22): a
  bucket created with `--jurisdiction eu` landed in EEUR, and a Worker whose
  binding sets `"jurisdiction": "eu"` wrote, read, listed and deleted an
  object. Free allowance each month: 10 GB stored, 1 million writes or lists,
  10 million reads, no egress charge (Standard storage only). The pricing page
  does not treat EU buckets differently.
- Other free-plan facts: 5 cron triggers per account (we use 1); D1 Time
  Travel keeps 7 days; **10 ms of CPU per request and per cron run**. Time
  spent waiting on D1 or R2 does not count, but building a large JSON snapshot
  in the Worker does. So the snapshot job builds its JSON inside D1
  (`json_group_array`) where it can, and its CPU time is measured on staging
  with a realistic data set (section 12).
- **Hostname: the Worker's `workers.dev` address** (decided 2026-11-22).
  `fairhursts.net` stays on GoDaddy's name servers, and a Worker custom
  domain needs a Cloudflare zone, so there is no `sync.fairhursts.net` for
  now. Worker names: `budgie-sync` (production) and `budgie-sync-staging`,
  giving `https://<worker>.<account>.workers.dev`. Consequences:
  - the server URL is build configuration in both apps, never hard-coded, so
    a custom domain can be added later without a data change;
  - there is no Cloudflare rate-limit rule (that needs a zone), so all rate
    limiting is done inside the Worker.
- TLS from Cloudflare; D1 and R2 are encrypted at rest by Cloudflare.
- `sync-server/` has its own `package.json` and wrangler config.
- The request handler is written against a tiny SQL-executor interface so the
  same code runs on D1 and on in-memory better-sqlite3 in Vitest. The
  interface is **batch-shaped**: D1 has no read-then-write transactions, only
  `batch()` (a list of statements run as one transaction).
- Local full stack for dev and e2e: **celld** (spike SY-004, celld 0.6.3). It
  ran the spike Worker unchanged from the same wrangler config, with local D1
  and R2, and every sync check passed. How to use it:
  - start: `celld dev <project> --port <port> --no-watch`, with `esbuild` on
    `PATH`; add `--clean` for an empty database (state otherwise persists in
    `<project>/.celld/dev`);
  - cron handlers fire on their real schedule only. There is no way to fire
    one by hand, so the snapshot job is tested by calling its function
    directly, and the dev build exposes it on a dev-only route for e2e.
- Where celld differs from Cloudflare (so these are proven on staging):
  - `meta.rows_read` / `rows_written` are not Cloudflare's billed counts;
  - a string over 2.2 MB is refused (Cloudflare accepted 2.6 MB);
  - no Time Travel;
  - it refuses to start if the config has an R2 `jurisdiction` or a
    `workers_dev` key. So `sync-server/` keeps a separate local config for
    celld without them, and the deployed config carries the EU setting.
- Fallback if celld causes trouble: `wrangler dev`, which ran the same spike.

## 3. Server

### Tables

```sql
users(id, name, seq, created_at)
devices(id, user_id, name, token_hash, created_at, revoked_at)
changes(user_id, tbl, public_id, hlc, deleted, payload, device_id, seq,
        PRIMARY KEY (user_id, tbl, public_id)) WITHOUT ROWID
-- index (user_id, seq, tbl, public_id)
```

- `WITHOUT ROWID` matters for cost: with a rowid table each accepted row
  billed 3 writes instead of 2.

- One entry per row, upserted. No log growth, no compaction job.
- `users.seq` is the per-user monotonic counter, bumped once per request. All
  rows accepted in one push share that `seq`.
- The pull cursor is therefore compound: `(seq, tbl, public_id)`. Clients
  treat it as an opaque value.
- `payload` is an opaque JSON string. The sync endpoint never parses it; only
  the snapshot job does (section 9).

### Endpoint

`POST /v1/sync`, `Authorization: Bearer <device token>`.

```
request:  { formatVersion, cursor, push: [envelope] }
response: { cursor, pull: [envelope], more, rejected: [{tbl, publicId, reason}] }
envelope: { tbl, publicId, hlc, deleted, payload }
```

Resolve `user_id` and `device_id` from the token hash (never from the body),
then run one D1 batch of four statements:

1. Bump `users.seq`.
2. Upsert the pushed envelopes from `json_each` over a single JSON parameter,
   `RETURNING` the accepted keys. An envelope is written only if both hold:
   - `hlc` is greater than the stored `hlc`;
   - `hlc` wall time is no more than 5 min ahead of server time.
3. Select entries after the cursor written by other devices, ordered by
   `(seq, tbl, public_id)`, one more than the page size to detect `more`.
4. Read back `users.seq`, used as the cursor when there is no further page.

`rejected` is the pushed envelopes minus the accepted keys, computed in the
Worker (`drift` if the wall time is too far ahead, otherwise `stale`).

Measured on real D1: a 500-row push with typical rows is about 160 KB and
runs in a few milliseconds; a 2.6 MB JSON parameter still worked and 10 MB
failed. The body cap is set well below that, at 1 MB.

Other rules:

- `formatVersion` newer than the server knows: accept. Clients do the version
  guard.
- Body size cap, chunked pushes (about 500 rows), rate limiting inside the
  Worker (section 2).
- CORS: allow `https://budget.fairhursts.net` only. BudgieMac is a native
  client, so CORS does not apply to it.
- Logs carry user id, device id, counts and reasons. Never payloads.

### Admin scripts (`sync-server/scripts/`)

- `add-user` (prints a one-time invite code; only its hash is stored),
  `new-invite`.
- `revoke-device`, `delete-user-data`.
- `list-snapshots`, `get-snapshot` (downloads one R2 snapshot as a file).

## 4. Contract (`sync-server/contract/`)

Both engines are built and tested against this, so it is written before
either.

- `SPEC.md`: envelope and payload shapes per table, HLC format and seal rule,
  LWW rule, natural-key collision rule, transfer-pair rule, deterministic
  auto-post id function, enrolment flows, error codes.
- `fixtures/*.json`: conformance cases, each "given local rows + incoming
  envelopes, expect these rows and these outgoing envelopes". The TS tests and
  the Swift tests both run every fixture.
- Format version: one number in the spec. A client refuses to apply a pull
  with a newer version and shows "update Budgie". A payload change that the
  other app cannot read is a version bump and needs both apps released.

## 5. Web local schema (migration 0014, written by hand)

`ALTER TABLE ... ADD COLUMN` and trigger changes only. No table drops.

- On all 10 syncable tables: `hlc text`, `sync_dirty integer not null default 0`.
- New trigger per table: on local insert or update, set `sync_dirty = 1`,
  unless `hlc` or `sync_dirty` changed in that statement (an engine write).
- **Drop and recreate the ten `*_sync_metadata_update` triggers from 0013** so
  they also skip engine writes. Tested on a scratch DB: with the 0013 triggers
  as they are, sealing a row bumps `updated_at`, clearing `sync_dirty` does not
  stick, and a remote apply with an unchanged `updated_at` re-dirties the row.
- New table `sync_state` (single row): `device_id`, `server_url`, `token`,
  `cursor`, `last_synced_at`, `last_error`, `enabled`. It lives in the database
  so the cursor commits atomically with applied rows.
- Follow the manual migration checklist: journal entry, snapshot, rebuild
  `public/db.js` and `public/services.js`, fresh-DB test.

## 6. TypeScript engine (`src/services/sync/`)

Runs in the web runtime over `DatabaseCapability`, so the multi-device tests
can drive it with `createTestDb()`.

### HLC (`hlc.ts`)

- Sortable string: `<wallMs padded>:<counter padded>:<deviceId>`.
- Stamped lazily when a dirty row is sealed for push:
  `hlc = max(hlc from row.updated_at, increment(row.hlc))`.
- `updated_at` is second resolution; counter and device id break ties.

### Row codec

- Refactor `portable-data.ts` to export per-table `toPortableRow` and
  `applyPortableRow` (upsert by `public_id`, FKs resolved from public ids).
- Export/import and sync both use them. The sync codec drops the two pending
  reconcile fields on encode and leaves the local values alone on apply.

### One sync cycle

1. Seal dirty rows (stamp `hlc`), encode, send with the stored cursor.
2. Keep requesting while `more` is true, buffering the pull in memory.
3. Apply the whole pull in one local transaction:
   - skip a row if the local `hlc` is greater or equal;
   - apply in table dependency order; second pass for `categories.parent_id`
     and transfer links;
   - write `hlc` and `sync_dirty = 0` explicitly;
   - store the new cursor in the same transaction.
4. Clear `sync_dirty` on pushed rows whose `hlc` still matches what was sent.
5. Repeat while dirty rows remain.
6. Run the integrity pass. Return counts so the UI can invalidate TanStack
   Query caches.

### Merge rules beyond LWW

- **Transfer pairs.** Both legs seal and push in the same batch. After apply:
  if one leg is deleted, delete the other.
- **Auto-post.** `processAutoPost` sets a deterministic UUID derived from a
  hash of the schedule's public id and the due date (plus a leg marker for
  transfers), so two devices posting the same occurrence merge into one row.
  The function is defined in the spec and implemented in TS and Swift.
- **Natural-key collisions** (`payees.name`, `envelope_categories.category_id`,
  `budget_allocations(envelope_id, month)`): decided in SY-009, contract
  SPEC.md section 8.10, with fixtures. Deleted rows never hold a key; among
  live rows claiming one key the lowest public id keeps it, the highest
  `hlc` supplies the content, and every other claimant is deleted and pushed.
  The earlier "higher `hlc` keeps the key, re-key the local row" proposal was
  replaced: a clock-based winner lets two devices delete different rows and
  leave none. The web keeps its plain `UNIQUE` constraints (two are inline
  and cannot change without a table rebuild) and instead stores a deleted
  row that would block a key in a tombstone store; SY-029 adds it.
- **Reconciliation.** After apply, compare each account's reconciled total with
  its last `account_reconciliations` balance. On mismatch show a "review
  reconciliation" notice. No automatic repair.

### Startup order

`src/web/runtime/runtime.ts` runs auto-post during boot. Change it to: open
database, sync if enabled and online (with a short timeout), then auto-post.

### Enrolment

- **Start sync** (first device for a user): rewrite any `legacy:*` public ids
  to fresh UUIDs, mark every row dirty, upload. The first sync transfers all
  data.
- **Join sync** (later devices): replace local data with the server copy.
  Offer a portable export first. No merging of independent books.
- `accountShortcuts` hold local account ids. Joining changes those ids, so
  remap shortcuts by public id during join and drop any that do not resolve.

### Other lifecycle

- **Disable on device:** stop syncing, keep local data, clear the token.
- **Portable import while synced:** allowed; warn that it overwrites all
  devices. Imported rows go out as ordinary dirty rows with fresh `hlc`.

## 7. Web wiring and UI

- `ApplicationAPI` additions in `src/platform/browser-api.ts`:
  `getSyncStatus`, `configureSync`, `syncNow`, `disableSync`. Electron's
  implementation reports sync as unsupported and the UI hides it.
- Token storage: in the OPFS database (no local encryption at rest, as already
  documented).
- CSP: add the sync origin to `connect-src` in `vite.config.ts` (both header
  blocks). Check `sw.js` does not intercept or cache requests to it.
- Settings: "Sync" section using existing shadcn Base UI components.
  - Consent screen, then an invite or device code field; Start / Join /
    Disable / Sign out / Delete my cloud data; "Add a device" and the
    device list.
  - "Sync now", last synced time, pending change count, last error.
  - "Download backup" (the existing portable export).
- Header: small status indicator (synced, pending N, offline, error).
- Scheduler hook: on app start, on focus, on `online`, about 5 s after a local
  write (debounced), every 5 min while open.
- Only the tab holding the instance lock syncs.
- Toasts for clock-drift rejection, version too old, revoked token, daily
  limit reached.

## 8. BudgieMac client (stories in `../budgie-mac/docs/STORIES.md`)

A second engine in Swift (`BudgieMacKit/Sync/`), built against the contract.

- **Model changes** (each new field has a default so stores keep loading):
  `hlc` and a dirty flag on the 10 synced models; a `Tombstone` model
  (`table`, `uuid`, `hlc`, dirty); a sync state record (device id, cursor,
  last synced, last error). Token in the Keychain.
- **Change tracking** (spike first): SwiftData has no triggers, `updatedAt` is
  set by hand in 18 places and is nil on many rows. Choose between a
  `ModelContext` save hook and SwiftData history. It must mark edits dirty and
  write a `Tombstone` for every hard delete, including cascades.
- **Codec:** reuse the `BudgieExport` / `BudgieImport` row shapes, minus the
  pending reconcile fields. `bankText`, `ImportRule` and `accountOrder` are
  never encoded and never overwritten on apply.
- **Cycle and merge rules:** as section 6, proven by the shared fixtures.
- **Auto-post:** `Scheduling.autoPost` uses the deterministic id function;
  sync before auto-post on launch.
- **Lifecycle rules still to write:** Start sync from the Mac (the real first
  device); Join on a Mac that already has data, keeping `bankText` and import
  rules for rows whose ids survive; restoring a Mac backup while synced
  ("restore wins": mark all dirty with fresh `hlc`, or "server wins": reset
  cursor and re-pull).
- **UI:** a Sync tab in Settings (new `SettingsTab` case), a menu item and
  shortcut for Sync Now, a status item in the window.
- Update `docs/BRIEF.md`: "no server" and "later: iCloud" no longer hold.

## 9. Backups

Three copies, all in the portable data format (`PORTABLE_FORMAT_VERSION` 1),
so any of them imports through the existing portable import on web or Mac.

| Copy                  | Made by                     | Holds                                  |
| --------------------- | --------------------------- | -------------------------------------- |
| Web "Download backup" | user, in Settings           | everything on that device              |
| BudgieMac backups     | on quit, existing behaviour | everything, incl. Mac-only data        |
| R2 snapshot           | Worker cron, daily          | synced rows only                       |

R2 snapshot details:

- A cron trigger reads each user's `changes` rows, groups payloads by table
  into a portable data package with a manifest and checksum, and writes
  `snapshots/<user>/<date>.json`. Keep 30 days; delete older ones in the same
  job.
- Same format, less content: `preferences` is empty, the pending reconcile
  fields are null, and there are no Mac import rules or `bankText`.
- Portable import replaces the settings row from the package. Importing a
  snapshot must not wipe device preferences: when the package's `preferences`
  is empty, keep the local ones (web and Mac).
- Restore path: `get-snapshot`, then portable import on any device. While
  synced, that goes out as ordinary dirty rows.
- The `changes` table is a replica, not a history: a bad delete syncs up.
  Snapshots are the history. D1 Time Travel (7 days on the free plan) is a
  second line.

## 10. Tests

- **Unit:** HLC encode, compare, increment, seal rule; deterministic id.
- **Server handler** (in-memory SQLite): auth, user isolation, stale push,
  delete then undelete, drift guard, paging, revoked device, snapshot output
  passes portable import validation.
- **Contract fixtures:** run by Vitest and by `swift test`.
- **Multi-device integration** (2-3 `createTestDb()` clients plus the
  in-memory server), covering:
  - offline edits on different rows; same row on two devices;
  - delete vs edit; delete then revive; transfer create, edit and delete;
  - duplicate auto-post; natural-key collisions;
  - reconcile on one device, edit on another;
  - parent arriving after child across pages;
  - interrupted push and retry; start flow with legacy ids; join flow.
- **Migration 0014:** trigger behaviour for local write, seal, ack and remote
  apply.
- **E2E (Chromium):** enable sync against the local celld stack, edit, reload,
  verify.
- **BudgieMac:** unit tests, a `SelfTest.swift` check per story, snapshots of
  the Sync tab.
- Standing gates: `bun run lint`, `bun run check-types`, `bun run test`,
  `bun run verify:web`, `bun run test:e2e`.

## 11. Delivery order

Stories for steps 1 to 6 are in `.ai-plans/sync-stories.md`.

1. Freeze Electron: stop releases (`release.yml` no longer runs on tags; the
   web deploy is already its own workflow) and mark it deprecated in the docs.
2. Spikes: D1 push batch (on real D1 and on celld), R2 free allowance, celld
   as the local stack.
3. Contract: spec and first fixtures.
4. Server: handler, tables, admin scripts, snapshot cron, tests. Deploy to a
   staging Worker.
5. Web: migration 0014, HLC module, row codec refactor (export/import
   unchanged), engine and merge rules with the multi-device suite.
6. Web wiring, Settings UI, scheduler, status indicator, enrolment flows.
   Seed a PWA from a Mac export for testing only.
7. BudgieMac: change-tracking spike, model changes, engine, lifecycle, UI.
8. Go live: BudgieMac runs Start sync as the first device; the phone PWA
   joins.
9. Docs and cleanup: update `docs/ARCHITECTURE.md`, mark
   `docs/SYNC_ENGINE_PLAN.md` superseded, update `CLAUDE.md` rules that only
   served Electron, add a `minor` changeset.
10. Run on own devices for a few weeks before giving tokens to users 2 and 3.

## 12. Risks

- Device clock far behind loses conflicts it should win; only fast clocks are
  rejected.
- Whole-row LWW drops a concurrent edit to a different field of the same row.
- Pure LWW lets a stale offline edit with a later clock resurrect a row
  deleted elsewhere.
- iOS can evict storage of a non-installed PWA after about a week unused,
  taking unsynced edits with it. Keep the pending count visible.
- Two engines can drift. The fixtures are the only guard; every merge bug
  becomes a fixture first.
- A Mac rebuilt from the server alone loses import rules and `bankText`; only
  the Mac's own backups hold them.
- celld is a young, separate implementation; behaviour proven only there is
  not proven for Cloudflare.
- The free plan's 10 ms of CPU per request may be too little to build a full
  snapshot. If staging shows that, the fix is the paid Workers plan (about $5
  a month) or snapshotting one table per run.
- Accepted: without end-to-end encryption, the server admin can read users 2
  and 3's data.

## 13. Consent and identity

Cloud sync moves financial data off the device. It must be a deliberate
choice, and a second app must prove it belongs to the same person.

### Consent (settled)

- Off by default on every app. Each app opts in separately.
- Before Start or Join, a consent screen states:
  - what is uploaded (all accounts, transactions, schedules, payees, budget
    data; not preferences);
  - where it goes (Cloudflare, the Worker's `workers.dev` address) and that daily
    snapshots are kept for 30 days;
  - that it is not end-to-end encrypted, so the operator can read it;
  - how to stop and how to delete.
- The consent (date, app version) is recorded in `sync_state`.
- Three separate actions, never merged:
  - **Disable on this device:** stop syncing, keep local data and the cloud
    copy.
  - **Sign out this device:** disable, and revoke this device's token.
  - **Delete my cloud data:** removes the user's `changes` rows and R2
    snapshots; local data stays. D1 Time Travel may still hold it for up to 7
    days; the screen says so.
- Settings lists the user's devices and can revoke any of them.
- Server additions: `GET /v1/devices`, `DELETE /v1/devices/:id`,
  `DELETE /v1/data`.
- Update the app's privacy wording: `docs/ARCHITECTURE.md` and the web app
  currently say there is no server.

### Identity (settled: invite, then approve from a device)

- **First app:** the operator runs `add-user`, which prints a one-time invite
  code (single use, expires). The user enters it after the consent screen; the
  server creates the device and returns its token. This replaces pasting a
  raw device token.
- **Further apps:** an enrolled app has "Add a device", which asks the server
  for a short code (single use, about 10 minutes). The new app enters the code
  and receives its own device token. Possession of an enrolled device is the
  proof of identity.
- **All devices lost:** the operator issues a new invite for the same user;
  the new device joins and pulls the server copy.
- Codes are stored hashed, rate-limited per IP and per user, and never logged.
- Server additions: `POST /v1/enrol` (invite or device code in, token out),
  `POST /v1/devices/code` (authenticated). `add-device` is removed from the
  admin scripts; `add-user` gains the invite, plus `new-invite`.
- Device tokens stay long-lived bearer secrets: Keychain on the Mac, the OPFS
  database on the web.
- Passkeys were considered and not chosen: on the Mac they need the
  associated-domains entitlement, which needs a paid Apple Developer team.

### Data location (settled)

- D1 database and R2 bucket are created in the EU jurisdiction. The consent
  screen names it.

### End-to-end encryption (settled)

- Not built. The consent screen's "the operator can read this" disclosure is
  the agreed answer for users 2 and 3.

## Unresolved questions

- BudgieMac signing: the Keychain ties an item to the app's code signature.
  Check that `build.sh` always signs with a stable identity, or every rebuild
  will prompt for Keychain access.

- BudgieMac change tracking: save hook or SwiftData history. (Spike.)
- BudgieMac lifecycle rules: Start, Join with existing data, backup restore.
- ~~Natural-key collision rule~~: settled in SY-009 (section 6, SPEC.md
  section 8.10).
- Payee uniqueness on the Mac. (Deferred.)
- ~~`budget_allocations` and `payees` inserts may fail today when a deleted
  row holds the same key~~: confirmed and fixed in SY-009. `payees.create`
  and `budgets.upsertAllocation` failed with a UNIQUE error, `payees.upsert`
  left the payee deleted, and quick fill skipped a month whose allocation was
  deleted. All now revive the deleted row (same public id), as
  `envelopes.createCategory` already did.
