# sync-server

Budgie's sync server: one Cloudflare Worker, one D1 database, one R2 bucket
(EU jurisdiction). Design: `.ai-plans/sync-engine.md`.

## Layout

- `src/` Worker and logic. `executor.ts` is the batch-shaped SQL interface;
  `d1-executor.ts` (Worker) and `sqlite-executor.ts` (Vitest, better-sqlite3)
  implement it. `admin.ts` holds the user and invite logic.
- `migrations/` D1 migrations. Statements end with `;` at the end of a line so
  `src/migrate.ts` can run the same file on better-sqlite3.
- `scripts/` thin admin CLIs over the logic in `src/`.
- `test/` Vitest tests, run by the root `bun run test`.
- `wrangler.jsonc` deployed config (D1 and R2 in the EU, `workers_dev`, Worker
  names `budgie-sync` and `budgie-sync-staging`). The D1 ids are placeholders;
  put real ones in only on the machine that deploys, never in git.
- `wrangler.local.jsonc` the same bindings without `jurisdiction` and
  `workers_dev`, which celld refuses.
- `src/version.ts` holds the contract version; it must match
  `contract/VERSION` once that file exists.

## Run locally

```
cd sync-server && bun install
PATH=../node_modules/.bin:$PATH celld dev wrangler.local.jsonc --port 8787 --no-watch   # add --clean for an empty DB
curl localhost:8787/v1/health
```

`celld` needs `esbuild` on `PATH` (the root install provides it).

### In e2e (SY-044)

`bun run test:e2e` starts this Worker on celld itself (Playwright `webServer`,
`scripts/e2e-sync-server.ts`): it copies `src/`, `migrations/` and
`wrangler.local.jsonc` to a fresh temp directory, so the e2e database is
empty on every run and never touches `sync-server/.celld`, sets
`ALLOWED_ORIGIN` to the e2e app origin via `.dev.vars`, listens on port 4600
and deletes the directory on shutdown. `e2e/sync-real.spec.ts` seeds its user
and invite with `POST /dev/admin/add-user`. celld is found via `$CELLD`,
`PATH` or `~/.local/bin`; CI installs a pinned release. `E2E_SYNC_LOGS=1`
prints the Worker's request log.

## Admin scripts

```
bun run add-user <name>      [--remote] [--env staging]
bun run new-invite <user>    [--remote] [--env staging]
```

Each prints a one-time invite code (12 characters, Crockford base32, SPEC 3.4). It is single use, expires after 7 days,
and only its SHA-256 is stored. Lose it and run `new-invite` again.

The scripts run their SQL through `wrangler d1 execute --command --json`, so
they need wrangler (`bun install` in this directory). `--file` is deliberately
not used: against a remote database it goes through the D1 import API, prints a
single summary row instead of a result per statement and takes the database
offline while it runs. The parser (`parseWranglerOutput`) requires one result
per statement and is unit-tested against the output shapes read from wrangler
4.166's source. Locally wrangler runs the statements as one `db.batch`
(a transaction); remotely they go in one `/query` request and the admin logic
does not rely on that being atomic (a half-done `add-user` is repaired with
`new-invite`; every other operation changes data with one statement).

**The remote path (`--remote`) is unverified until the staging deploy**: it has
only been checked against wrangler's source, never run.

- default (`--local`): wrangler's local D1 in `.wrangler/state`. Create the
  schema first with
  `bunx wrangler d1 migrations apply budgie-sync-local --local --config wrangler.local.jsonc`.
- `--remote`: the real D1 database from `wrangler.jsonc` (use `--env staging`
  for staging), after `wrangler login` and
  `bunx wrangler d1 migrations apply <db> --remote`.

Against a running `celld dev` there is a dev-only route instead, because
celld keeps D1 in its own store and `celld d1 execute` needs a production
fleet bucket. `wrangler.local.jsonc` sets `DEV_MODE=1`, which makes the Worker
apply `migrations/` on boot and serve `POST /dev/admin/add-user`
(`{"name"}`) and `POST /dev/admin/new-invite` (`{"user"}`), returning the
invite code as JSON. `DEV_MODE` must never be set in `wrangler.jsonc`; without
it those routes answer `404 not_found`.

## Rate limits

Values live in `src/rate-limit.ts`:

- `POST /v1/enrol`: 10 failed attempts per IP per 15 minutes, then `429`. A
  successful enrol is not counted. The IP is `CF-Connecting-IP`. Failures are
  counted in Worker memory (`FailedAttemptGuard`); only when an IP reaches the
  limit does that isolate write one marker row in `rate_limits` for the IP and
  window (a repeat in the same window is a no-op), and every enrolment reads
  the marker first, so the block holds across isolates. An IP already blocked
  in an isolate is refused without touching D1. Because counting is per
  isolate, an attacker spread over isolates gets up to 10 failures per isolate
  before the marker lands; with 60-bit codes that is irrelevant to guessing.
  **Worst-case D1 writes per day from this path:** failed enrols themselves
  write nothing (the consume batch matches no row); marker writes are capped at
  60 per hour per isolate, so at most 1,440 per isolate per day, against the
  free plan's 100,000. The snapshot cron prunes `rate_limits` rows from windows
  older than a day.
- `POST /v1/devices/code`: 5 codes per user per 10 minutes, one atomic
  upsert-and-count statement per request (authenticated, so bounded by the
  number of devices).
- Every route, per IP: 120 requests per minute (`MemoryIpLimiter` in
  `src/limits.ts`). CORS preflights (`OPTIONS`) are answered `204` first and
  not counted: a browser treats a failed preflight as a network error, so a
  limited preflight would hide the `429` and its `retryAfter` (found by the
  SY-044 e2e). It lives in Worker memory, so it costs no D1 write (the
  free plan allows 100k row writes a day). Each isolate counts separately, so
  the effective ceiling is 120 times the number of live isolates and the
  counter resets when an isolate is recycled: a best-effort brake on a runaway
  client, not an exact quota.

## Other limits and behaviour

- Body cap 1 MiB (checked from `Content-Length` and while streaming) and at
  most 500 envelopes per push. Payloads are bound to D1 re-escaped as JSON
  strings; a push whose encoded parameter exceeds 1,900,000 bytes is refused
  with `413 body_too_large` (D1's limit is 2,000,000) so a client never loops
  on a 500.
- CORS: only the origin in the `ALLOWED_ORIGIN` var (production
  `https://budget.fairhursts.net`) gets headers; `DEV_MODE` adds
  `http://localhost:3000` and `http://127.0.0.1:3000`.
- Logs: one JSON line per request with route label, method, status, user id,
  device id, counts and a reason. Never bodies, tokens, codes, query strings
  or error messages.
- `daily_limit`: Cloudflare does not document the exact error text for the D1
  free-plan daily quota. `isDailyLimitError` matches messages containing
  "daily read/write/limit/quota", "exceeded ... daily" or "free tier limit".
  This is unverified; check the real message when it first happens and adjust.
  It returns `503 daily_limit` with `retryAfter` to the next 00:00 UTC.

## Deploy checklist (SY-021)

- Create the D1 database and R2 bucket in the EU jurisdiction, put the real
  ids only in a local copy of `wrangler.jsonc`.
- Apply `migrations/` with `wrangler d1 migrations apply`.
- Confirm `DEV_MODE` is not set. After deploying staging, verify
  `POST /dev/admin/add-user` returns `404 not_found` and that `/v1/health` is
  `200`.

## Staging (deployed 2026-11-22)

`https://budgie-sync-staging.mark-fairhurst.workers.dev`, D1
`budgie-sync-staging` and R2 `budgie-sync-snapshots-staging`, both EU. The
database id lives only in the maintainer's local `wrangler.jsonc`
(`wrangler d1 list` shows it).

```
bunx wrangler d1 migrations apply budgie-sync-staging --remote --env staging
bunx wrangler deploy --env staging
bun run add-user <name> --remote --env staging
```

A cron cannot be fired by hand. To test the snapshot, set the staging cron to
`* * * * *`, deploy, watch `bunx wrangler tail --env staging --format json`,
then set it back to `0 3 * * *` and deploy again. A schedule change can take
a few minutes to take effect.

### Measured on staging

CPU per invocation, from `wrangler tail` (free plan, documented limit 10 ms):

| Call                                   | CPU       |
| -------------------------------------- | --------- |
| health                                 | 0–1 ms    |
| sync, nothing to send or fetch         | 2–5 ms    |
| sync, pull one page of 500 rows        | 1–8 ms    |
| sync, push 100 rows                    | 13 ms     |
| sync, push 500 rows                    | 11–42 ms  |
| snapshot, 2 rows                       | 8 ms      |
| snapshot, 1,100 rows                   | 13–33 ms  |
| snapshot, 20,100 rows (8 MB package)   | 130–297 ms |

Every call finished with outcome `ok`: Cloudflare did not enforce the 10 ms
limit on these runs. Do not rely on that. A 500-row push and any real
snapshot are well over the documented limit, so a first upload or the nightly
snapshot may start failing with error 1102 without warning. The Workers Paid
plan (30 s CPU) removes the risk.

The snapshot job rewrites today's object each time it runs.

## Snapshots

A cron trigger (03:00 UTC) runs `runSnapshots` (`src/snapshot.ts`): for every
user with rows it writes `snapshots/<user>/<date>.json` to R2, records it in
the D1 table `snapshots` (the admin scripts list from there, because wrangler
cannot list R2 objects) and removes snapshots older than 30 days.

- The package is a portable data package, format 1. D1 builds each
  collection's JSON (`json_group_array` over the stored payload text, 300 rows
  per chunk, `json_set` adds the two null pending-reconcile fields to
  accounts). The Worker concatenates, parses once, stringifies once and
  hashes: `portable-data.ts` verifies SHA-256 of
  `JSON.stringify(JSON.parse(document))`, and stored payloads are client bytes
  that may not be canonical, so the checksum cannot be computed without a
  parse. CPU is linear in data size; see "Measured on staging" below.
- Free plan: 50 D1 queries per Worker invocation. The job uses about three
  per user plus one per pruned snapshot, which is fine for a few users.
- A snapshot built just before `DELETE /v1/data` can land after it; it
  disappears at retention or on the next delete.
- celld cannot fire a cron. In dev (`DEV_MODE`) `POST /dev/admin/run-snapshots`
  runs the same job.

More admin scripts (same `--remote` / `--env staging` flags; `--local` means
wrangler's local D1 and R2, not celld's):

```
bun run revoke-device <deviceId>
bun run delete-user-data <user> [--remove-user]
bun run list-snapshots <user>
bun run get-snapshot <user> <YYYY-MM-DD> [--out file]
```
