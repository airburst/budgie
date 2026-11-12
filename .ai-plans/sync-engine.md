# Budgie Sync Engine Plan

Status: draft, 2026-11-12. Supersedes the PowerSync recommendation in
`docs/SYNC_ENGINE_PLAN.md` for the current scale (3 users, separate books).

## 1. Decisions already made

- Per-user storage; 1 user now, 3 eventually. No shared books.
- Encrypted in transit and at rest.
- Whole-row last-write-wins, ordered by a row-level hybrid logical clock (HLC).
- Manual "Sync now" plus background sync.
- Row payloads reuse the portable export row shapes (`Portable*` types in
  `src/services/portable-data.ts`), exchanged as deltas, not whole files.
- HTTPS plus Cloudflare at-rest encryption is sufficient. No end-to-end
  encryption.
- Preferences (`settings`) stay per-device and are not synced.
- `sync_state` is exempt from the five-file entity CRUD rule.
- Server lives in this repo under `sync-server/`. Monorepo later, not now.
- Hostname: `sync.fairhursts.net`.
- PowerSync spike removed (done 2026-11-12, uncommitted).

## 2. Hardware and hosting

- No hardware. One Cloudflare Worker + one D1 database at
  `sync.fairhursts.net`. Free tier is enough for 3 users.
- TLS from Cloudflare; D1 is encrypted at rest by Cloudflare.
- Server code lives in `sync-server/` (own `package.json`, `wrangler.toml`).
- The request handler is written against a tiny SQL-executor interface so the
  same code runs on D1 in production and on in-memory better-sqlite3 in Vitest.
- Check current D1 limits before sizing batches (queries per invocation,
  statement size). Use one bulk upsert per request via `json_each`.

## 3. Server

### Tables

```sql
devices(id, user_id, name, token_hash, created_at, revoked_at)
changes(user_id, tbl, public_id, hlc, deleted, payload, device_id, seq,
        PRIMARY KEY (user_id, tbl, public_id))
-- index (user_id, seq)
```

- One entry per row, upserted. No log growth, no compaction job.
- `seq` is a per-user monotonic counter, used only as the pull cursor.
- `payload` is an opaque JSON string; the server never parses it.

### Endpoint

`POST /v1/sync`, `Authorization: Bearer <device token>`.

```
request:  { formatVersion, cursor, push: [envelope] }
response: { cursor, pull: [envelope], more, rejected: [{tbl, publicId, reason}] }
envelope: { tbl, publicId, hlc, deleted, payload }
```

One D1 transaction per request:

1. Resolve `user_id` and `device_id` from the token hash. Never from the body.
2. For each pushed envelope, write it only if all hold:
   - `hlc` is greater than the stored `hlc`;
   - the stored row is not a tombstone (tombstone always wins);
   - `hlc` wall time is no more than 5 min ahead of server time.
3. Return entries with `seq > cursor` written by other devices, paged.

Other rules:

- `formatVersion` newer than the server knows: accept (payload is opaque).
  Clients do the version guard (section 5).
- Body size cap, chunked pushes (about 500 rows), Cloudflare rate-limit rule.
- CORS: allow `https://budget.fairhursts.net` only. Electron calls from the
  main process, so CORS does not apply there.
- Logs carry user id, device id, counts and reasons. Never payloads.

### Admin scripts (`sync-server/scripts/`)

- `add-user`, `add-device` (prints the token once; only the SHA-256 is stored).
- `revoke-device`, `delete-user-data`.

## 4. Local schema (migration 0014, written by hand)

`ALTER TABLE ... ADD COLUMN` only. No table drops.

- On all 10 syncable tables: `hlc text`, `sync_dirty integer not null default 0`.
- New trigger per table: on local insert or update, set `sync_dirty = 1`.
  Fires only when neither `hlc` nor `sync_dirty` changed in that statement, so
  the engine's own writes (remote apply, seal, ack) do not re-dirty the row.
- Test interaction with the existing `*_sync_metadata_update` triggers.
- New table `sync_state` (single row): `device_id`, `server_url`, `cursor`,
  `last_synced_at`, `last_error`, `enabled`. It must live in the database so
  the cursor commits atomically with applied rows.
- `sync_state` is internal. It gets `sync:*` channels, not the five-file entity
  CRUD from `CLAUDE.md` (agreed exemption).
- Follow the manual migration checklist: journal entry, snapshot, rebuild
  `public/db.js` and `public/services.js`, fresh-DB test.

## 5. Client engine (`src/services/sync/`)

Runs in the Electron main process and in the web runtime, over
`DatabaseCapability`, like the other shared services.

### HLC (`hlc.ts`)

- Sortable string: `<wallMs padded>:<counter padded>:<deviceId>`.
- Stamped lazily when a dirty row is sealed for push:
  `hlc = max(hlc from row.updated_at, increment(row.hlc))`.
- That gives write-time ordering and per-row monotonicity, which is all
  row-level LWW needs. No global clock state.
- `updated_at` is second resolution; counter and device id break ties.

### Row codec

- Refactor `portable-data.ts` to export per-table `toPortableRow` and
  `applyPortableRow` (upsert by `public_id`, FKs resolved from public ids).
- Export/import and sync both use them. Portable format stays free of sync
  fields (`hlc`, `sync_dirty`, cursor).

### One sync cycle

1. Seal dirty rows (stamp `hlc`), encode, send with the stored cursor.
2. Apply the pull in one local transaction:
   - skip a row if the local `hlc` is greater or equal;
   - apply in table dependency order; second pass for `categories.parent_id`
     and transfer links;
   - write `hlc` and `sync_dirty = 0` explicitly.
3. Clear `sync_dirty` on pushed rows whose `hlc` still matches what was sent.
4. Store the new cursor in the same transaction as step 2.
5. Repeat while `more` is true or dirty rows remain.
6. Run the integrity pass (below). Return counts so the UI can invalidate
   TanStack Query caches.

Refuse to apply and surface "update Budgie" if a pulled `formatVersion` is
newer than `PORTABLE_FORMAT_VERSION`.

### Merge rules beyond LWW

- **Tombstone wins.** Enforced on server and client.
- **Transfer pairs.** Both legs seal and push in the same batch. After apply:
  if one leg is tombstoned, tombstone the other.
- **Auto-post.** `processAutoPost` sets a deterministic `public_id`
  (`auto:<scheduledPublicId>:<dueDate>`, plus a leg suffix for transfers), so
  two devices posting the same occurrence merge into one row. Pull before
  auto-post on startup.
- **Natural-key collisions** (two devices create the same thing offline):
  `payees.name`, `envelope_categories.category_id`,
  `budget_allocations(envelope_id, month)`. Higher `hlc` keeps the key; the
  loser is tombstoned and its tombstone pushed. Needs dedicated tests because
  soft-deleted rows still occupy the unique index.
- **Reconciliation.** After apply, compare each account's reconciled total with
  its last `account_reconciliations` balance. On mismatch show a "review
  reconciliation" notice. No automatic repair.
- `accounts.balance` is the opening balance; running balances are computed, so
  it needs no special handling.

### Enrolment

Existing `public_id`s are `legacy:<table>:<id>`, which collide between
databases that were populated independently.

- **First device:** "Start sync" marks every row dirty and uploads.
- **Later devices:** "Join sync" replaces local data with the server copy.
  Local rows are tombstoned without being marked dirty, then the pull is
  applied. Offer a portable export first. No merging of independent books.
- Preferences are per-device, but `accountShortcuts` hold local account ids.
  Joining changes those ids, so remap shortcuts by `public_id` during join
  (drop any that no longer resolve).

### Other lifecycle

- **Disable on device:** stop syncing, keep local data, clear token.
- **Portable import while synced:** allowed; warn that it overwrites all
  devices. Imported rows go out as ordinary dirty rows.
- **Electron backup restore while synced:** an old cursor would let the server
  undo the restore. After restore, ask: "restore wins" (mark all dirty with
  fresh `hlc`) or "server wins" (reset cursor and re-pull).

## 6. Platform wiring

- `ApplicationAPI` additions: `getSyncStatus`, `configureSync`, `syncNow`,
  `disableSync`. Channels `sync:getStatus`, `sync:configure`, `sync:now`,
  `sync:disable`.
- Files: `public/ipc/shared-services.js`, `public/preload.js`,
  `src/types/electron.d.ts`, `src/platform/browser-api.ts`.
- Token storage: Electron `safeStorage`; web in the OPFS database (no local
  encryption at rest, as already documented).
- Web CSP: add the sync origin to `connect-src` in `vite.config.ts` (both
  header blocks). Electron needs no CSP change.
- Check `sw.js` does not intercept or cache requests to the sync origin.

## 7. UI

- Settings: "Sync" section using existing shadcn Base UI components.
  - Server URL and device token fields; Start / Join / Disable.
  - "Sync now" button, last synced time, pending change count, last error.
- Header: small status indicator (synced, pending N, offline, error).
- Scheduler hook in the renderer, shared by both platforms:
  - on app start (before auto-post), on window focus, on `online`;
  - about 5 s after a local write (debounced);
  - every 5 min while open.
- Web: only the tab holding the instance lock syncs.
- Toasts for clock-drift rejection, version too old, revoked token.

## 8. Tests

- **Unit:** HLC encode, compare, increment, seal rule.
- **Server handler** (in-memory SQLite): auth, user isolation, stale push,
  tombstone wins, drift guard, paging, revoked device.
- **Multi-device integration** (2-3 `createTestDb()` clients plus the in-memory
  server), covering:
  - offline edits on different rows; same row on two devices;
  - delete vs edit; transfer create, edit and delete;
  - duplicate auto-post; natural-key collisions;
  - reconcile on one device, edit on another;
  - interrupted push and retry; join flow; restore flow.
- **E2E (Chromium):** enable sync against a local server, edit, reload, verify.
- Standing gates: `bun run lint`, `bun run check-types`, `bun run test`,
  `bun run verify:web`, `bun run test:e2e`.

## 9. Delivery order

1. Server: handler, tables, admin scripts, tests. Deploy to a staging Worker.
2. Migration 0014, HLC module, row codec refactor (export/import unchanged).
3. Sync engine and merge rules, with the multi-device test suite.
4. Platform wiring and Settings UI; manual sync only.
5. Background scheduler, status indicator, enrolment and restore flows.
6. Docs and cleanup:
   - update `docs/ARCHITECTURE.md` ("no server and no sync" no longer true);
   - mark `docs/SYNC_ENGINE_PLAN.md` superseded;
   - add a `minor` changeset.
7. Run on own devices for a few weeks before giving tokens to users 2 and 3.

## 10. Risks

- Device clock far behind loses conflicts it should win; only fast clocks are
  rejected.
- Whole-row LWW drops a concurrent edit to a different field of the same row.
- iOS can evict storage of a non-installed PWA after about a week unused,
  taking unsynced edits with it. Keep the pending count visible.
- Trigger interplay (dirty flag vs `updated_at` triggers) is the most likely
  source of subtle bugs; cover it early.
- Accepted: without end-to-end encryption, the server admin can read users 2
  and 3's data.

## Unresolved questions

None.
