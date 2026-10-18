# Phase 4 Manual Checklist

Complete these checks on the deployed preview or production origin using a
fresh disposable browser profile. Do not use a real financial database.

## Status: 1.0 released (2026-10-18)

Budgie 1.0.1 is live at https://budget.fairhursts.net and on GitHub Releases.
Mark reported (2026-10-18) that the production web app was tested and all good.
Device model, OS/browser versions and per-check detail were not recorded, so
treat the table below as sign-off, not a measurement log.

Persistence across visits does not establish browser eviction protection.
Budgie never claims it.

## Verified

| Check                                                                                                                             | Result                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Local Chrome and Safari PWA persistence, installation, offline, private browsing                                                  | Passed (Mark, 2026-10-16/17)   |
| iPhone: published app renders, account creation, revisit persistence, offline                                                     | Passed (2026-10-16)            |
| Safari restart and installed-PWA persistence; short offline run                                                                   | Passed (2026-10-17)            |
| Device UX across iPhone/iPad/Electron (Phase 5)                                                                                   | Passed                         |
| Deploy, upgrade (A→B) and dashboard rollback on a throwaway Pages project: headers, offline, update prompt, same URL, data intact | Passed (2026-10-18)            |
| Production headers, caching, manifest, icons, http→https                                                                          | Verified by probe (2026-10-18) |
| Production web app on real devices                                                                                                | Passed (Mark, 2026-10-18)      |
| Electron 1.0 build against a copy of a real database                                                                              | Verified (Mark, 2026-10-18)    |

## Known gaps (not blocking 1.0)

- Exhaustive offline route pass (every route, every lazy chunk) on a phone.
- Storage pressure and quota behaviour (simulate denial or exhaustion in a
  disposable profile; Budgie must report it and keep existing data readable).
- Performance baseline: startup/migrations, bulk import and reporting with a
  large dataset on target iPhone/iPad, recorded with device, OS and dataset size.
- Android Chrome, physical, and Firefox coverage.
- Phase 5 accessibility bar not formally run: 200% text zoom, WCAG contrast and
  screen-reader pass, breakpoint matrix at -1/at/+1px.
- Desktop auto-update does not reach installed apps while the repository is
  private (see `docs/BACKLOG.md`).

Move items out of this list, with dates and device details, as they are done.

## How to run the manual checks

Use a fresh disposable browser profile; never a real financial database.

- **Home screen icon and name.** iOS caches the icon at install, so delete any
  earlier copy and re-add from Safari (Share → Add to Home Screen). On Android
  Chrome uninstall and reinstall. Success: Budgie piggy-bank icon (not cropped,
  maskable on Android), name "Budgie", launches standalone, favicon in the tab.
- **Safari restart / installed PWA persistence.** Create a disposable record,
  quit completely, reopen the same origin; the record remains and migrations are
  not rerun.
- **Storage pressure and quota.** Use browser storage tools or OS pressure
  simulation; retry startup and a write. Success: a storage/quota failure is
  reported and existing data stays intact.
- **Private browsing.** Success: a clear private-browsing/storage-unavailable
  state, never a partially initialised app.
- **Offline.** Load once online, close the tab, disable networking, reopen the
  origin or installed PWA and visit each route. Success: every route loads, lazy
  chunks render, local data is usable.
- **Real-device interaction.** iPhone/iPad Safari and Android Chrome, portrait
  and landscape, keyboard-open forms and safe-area edges. Success: nothing
  clipped or overlapping, usable touch targets, visible focus, nothing depends
  on hover or gestures.
- **Deploy, upgrade and rollback.** See `docs/RELEASE_RUNBOOK.md` (rehearsal).
- **Performance baseline.** Measure startup/migrations, bulk import, reporting
  queries and a large transaction dataset; record browser, OS, device, dataset
  size and any interaction delay.

## Large-dataset testing with real data

Export an Electron database as a Portable Data Package and import it on a
phone or tablet:

```
bun run export:portable                      # ~/budgie.db -> ./budgie-export.json
bun run export:portable path/to/budgie.db -o ~/Desktop/budgie.json --force
```

The source database is never modified: it is snapshotted with SQLite's backup
API (safe while Electron is running) and the copy is migrated to the current
schema before export, so older databases work. The output is real financial
data written owner-only; `budgie-export*.json` is git-ignored, but don't share
it. Transfer it with AirDrop/Files, then use Settings -> Import on the web app
(import replaces the device's data; use a disposable profile).

Record browser, OS, device, dataset size, startup/migration time, and any
interaction delay against "Persistence/performance baseline" above.
