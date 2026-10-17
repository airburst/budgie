# Phase 4 Manual Checklist

Complete these checks on the deployed preview or production origin using a
fresh disposable browser profile. Do not use a real financial database.

## Baseline Sign-Off: 2026-10-16

Mark approved the deployed functional baseline and proceeding to Phase 5 design.
On an iPhone, the published Cloudflare app renders, including Settings; account
creation works, data survives a second visit, and offline operation is confirmed.
Device model, OS/browser versions, and the exact test URL were not recorded.
Mobile layout remains the expected Phase 5 work, not a baseline failure.

This is approval to begin design, not public-release approval or blanket
approval of redesigned routes and modals. Unverified restart, quota/storage
pressure, performance, Access policy, and rollback checks remain release work.
Persistence across visits does not establish browser eviction protection.

## Verified

- Chrome and Safari local PWA persistence passed.
- Local PWA installation and offline persistence passed.
- Private browsing passed.
- Settings now renders; the previous browser-only failure is resolved.
- Published iPhone account creation, revisit persistence, and offline operation
  passed (reported by Mark on 2026-10-16).
- Safari restart persistence and installed-PWA persistence passed (reported by
  Mark, 2026-10-17). Offline operation held for a short (~3 minute) test; an
  exhaustive offline route pass remains open.

## Acceptance Checks

- Safari restart persistence
  - What: OPFS database survives Safari quit/reopen.
  - How: Load, create a disposable record, quit Safari completely, reopen the
    same origin, and reload.
  - Success: The record remains and migrations are not rerun.

- Installed PWA persistence
  - What: The installed PWA can reopen its local database.
  - How: Install from Safari/Chrome where supported, create a disposable
    record, close and relaunch the installed app.
  - Success: The record remains and the app starts offline.

- Storage pressure and quota
  - What: Storage denial or exhaustion is reported without data corruption.
  - How: Use browser storage tools or OS pressure simulation in a disposable
    profile; retry startup and a write.
  - Success: Budgie reports a storage/quota failure, does not claim eviction
    protection, and existing readable data remains intact.

- Private browsing
  - What: Unsupported private-mode storage is handled clearly.
  - How: Open the deployed origin in a private/incognito window.
  - Success: Budgie shows the private-browsing or storage-unavailable state;
    it never presents a partially initialized application.

- Safari and mobile offline startup
  - What: The complete application opens without a network connection.
  - How: Load once online, close the tab, disable networking, reopen the
    origin or installed PWA, and visit each route.
  - Success: Every route loads, lazy chunks render, and local data is usable.
  - Current result: iPhone offline operation and Settings rendering confirmed
    by Mark on 2026-10-16. Exhaustive offline route coverage and the wider device
    matrix remain release checks alongside the Phase 5 redesign.

- Real-device interaction
  - What: Touch and mobile browser behavior meet the Phase 5 acceptance bar.
  - How: Check current iPhone/iPad Safari and Android Chrome in portrait and
    landscape, including keyboard-open forms and safe-area edges.
  - Success: No clipped or overlapping content, touch targets are usable,
    focus remains visible, and no workflow depends on hover or gestures.
  - Current result: Deferred until Phase 5 mobile-first redesign.

- Cloudflare preview and production
  - What: Deployment, origin isolation, and rollback configuration work.
  - Current result: Automated `web-platform` preview deployment passed; the
    published app is usable on iPhone. Access policy, production deployment,
    origin isolation, and rollback acceptance are not yet recorded.
  - How: Deploy a PR preview, verify its URL and Cloudflare Access policy,
    then deploy a tagged artifact and restore the previous artifact.
  - Success: Preview and production use separate origins/databases, only
    authorized preview users can access previews, and rollback serves the
    previous artifact without changing its origin.

- Persistence/performance baseline
  - What: Startup and representative workloads are acceptable on target
    Safari and mobile hardware.
  - How: Measure startup/migrations, bulk import, reporting queries, and a
    large transaction dataset on representative devices.
  - Success: Results are recorded with browser, OS, device, dataset size, and
    no corruption, timeout, or unacceptable interaction delay.

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
