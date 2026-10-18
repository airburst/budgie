# Release Runbook

Production web origin: **https://budget.fairhursts.net** (Cloudflare Pages
project `budgie-web`, production branch `main`). The hostname is permanent:
browser data (OPFS) is bound to the origin, so changing it strands every
user's local database. `budgie-web.pages.dev` is a different origin; never use
or install from it.

## Pipelines

| Trigger                                      | Workflow     | Result                                                                        |
| -------------------------------------------- | ------------ | ----------------------------------------------------------------------------- |
| Pull request                                 | Web Deploy   | Build + verify only (no deploy)                                               |
| Manual (Actions → Web Deploy → Run workflow) | Web Deploy   | Build the selected branch, deploy preview alias (defaults to the branch name) |
| `v*` tag                                     | Web Deploy   | Tag-on-main check, lint/types/unit/e2e, build + verify, **production** deploy |
| `v*` tag                                     | Release      | Tag-on-main check, Electron mac/win builds + GitHub release (auto-update)     |
| PR / push to `main`                          | Web Platform | lint, types, unit, e2e                                                        |

Rules enforced by the workflows:

- A `v*` tag must be an ancestor of `origin/main`, for both Pages and Electron.
- Production Pages deploys only after lint, check-types, unit and e2e pass.
- Manual preview refuses `project=budgie-web` with alias `main`.
- The same tag drives both artifacts; the web build and Electron build read the
  version from `package.json`.

## Cutting a release

1. Land work on `main` (fix forward; `main` is always releasable).
2. On `main`: `bun run version` (consumes changesets), then commit
   `package.json`, `CHANGELOG.md`, `.changeset` as "Bump version" and push.
3. `bun run release` tags `v<version>` and pushes it.
4. Watch **Web Deploy** (checks → production) and **Release** (mac/win → publish).
5. Verify https://budget.fairhursts.net: response headers (COOP/COEP/CSP),
   offline reload, service-worker update prompt on the next release, install
   to home screen (see PHASE4_MANUAL_CHECKLIST.md "Home screen icon and name").
6. Edit the GitHub release notes (they are created empty).

## Release history

- `v1.0.0` (2026-10-18): web deployed; the Windows build failed (a Windows-only
  path bug in the web-artifact plugin), so the GitHub release was never
  published and was deleted. The tag remains.
- `v1.0.1`: first complete release (web + macOS + Windows).

Before tagging, cheaply catch platform-only build failures: the Release
workflow builds mac and Windows only on a tag, so a failure leaves a draft
release and the web already live. Fix forward with the next patch tag.

## Desktop auto-update

The Electron updater reads GitHub Releases without credentials. While the
repository is **private** it gets 404s and, because errors are swallowed,
installed apps never see updates. Until that is resolved (see `docs/BACKLOG.md`)
tell desktop users to install new versions from the Releases page. macOS builds
are unsigned: updates only notify; Windows would auto-download.

## Previews

Run the Web Deploy workflow manually, choosing the branch in "Use workflow
from". Optional `alias` overrides the preview name; optional `project` targets
another Pages project (rehearsals). Previews are behind Cloudflare Access.
A preview has its own origin, so its data is separate and disposable.

## Rollback (web)

Cloudflare dashboard → Workers & Pages → `budgie-web` → Deployments →
pick the previous production deployment → **Rollback to this deployment**.
The origin does not change, so local data is unaffected. Alternatively, re-run
the Web Deploy workflow for the previous tag.

**Migration caveat:** database migrations only move forward. Rolling code back
is safe only when the release being rolled back **added no migration**. If it
did, fix forward instead. Clients pick up the rolled-back build through the
normal service-worker update prompt.

Electron has no remote rollback: publish a new patch release.

## Rehearsal (no tags)

1. Create a Pages project `budgie-web-rehearsal` from the terminal; the
   dashboard now creates a Worker instead, which the workflow cannot deploy to:
   `bunx wrangler pages project create budgie-web-rehearsal --production-branch=main`.
2. Run Web Deploy manually with `project=budgie-web-rehearsal`, `alias=main`,
   twice from two different commits (artifact A, then B).
3. Check headers, offline, the update prompt, then roll back to A from the
   dashboard and confirm A is served on the same URL with data intact.
4. Delete the rehearsal project.

Last rehearsed 2026-10-18: headers, offline, update prompt, upgrade and
rollback (same URL, data intact) all passed.

## Cloudflare settings that must stay as they are

- DNS for `fairhursts.net` is at GoDaddy; `budget` is a CNAME to
  `budgie-web.pages.dev`. There is no Cloudflare zone, so Rocket Loader, Web
  Analytics/Zaraz injection and email obfuscation do not apply. If DNS ever
  moves to Cloudflare, turn those off (they break the strict CSP and the "no
  analytics" rule) and keep Always Use HTTPS on. Pages already redirects
  http to https.
- No cache rules overriding `sw.js` or `index.html` (they ship `no-cache`).
- Cloudflare Access: previews (`*.budgie-web.pages.dev`) only; production is
  public.
- API token: Pages Edit scope only, stored as the `CLOUDFLARE_API_TOKEN`
  repository secret (with `CLOUDFLARE_ACCOUNT_ID`).
