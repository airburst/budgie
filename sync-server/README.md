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

## Admin scripts

```
bun run add-user <name>      [--remote] [--env staging]
bun run new-invite <user>    [--remote] [--env staging]
```

Each prints a one-time invite code (12 characters, Crockford base32, SPEC 3.4). It is single use, expires after 7 days,
and only its SHA-256 is stored. Lose it and run `new-invite` again.

The scripts run their SQL through `wrangler d1 execute --file --json`, so they
need wrangler (`bun install` in this directory):

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

Counted in the D1 table `rate_limits` (fixed windows), because Worker memory
is per isolate. Values live in `src/rate-limit.ts`:

- `POST /v1/enrol`: 10 failed attempts per IP per 15 minutes, then `429`.
  A successful enrol is not counted. The IP is `CF-Connecting-IP`.

Expired rows in `rate_limits` are overwritten on the next failure for the same
bucket; they are never swept (a few bytes per IP that ever failed).
