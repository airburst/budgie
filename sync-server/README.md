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
  `contract/VERSION`.

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

Each prints a one-time invite code. It is single use, expires after 7 days,
and only its SHA-256 is stored. Lose it and run `new-invite` again.

The scripts run their SQL through `wrangler d1 execute --file --json`, so they
need wrangler (`bun install` in this directory):

- default (`--local`): wrangler's local D1 in `.wrangler/state`. Create the
  schema first with
  `bunx wrangler d1 migrations apply budgie-sync-local --local --config wrangler.local.jsonc`.
- `--remote`: the real D1 database from `wrangler.jsonc` (use `--env staging`
  for staging), after `wrangler login` and
  `bunx wrangler d1 migrations apply <db> --remote`.

Limitation: celld keeps D1 in its own store (`.celld/dev`), and `celld d1
execute` only works against a production fleet bucket. The scripts therefore
cannot write to the database of a running `celld dev` server. A dev-only
route in the Worker for this is left for SY-012 or later.
