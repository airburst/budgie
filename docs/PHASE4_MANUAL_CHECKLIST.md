# Phase 4 Manual Checklist

Complete these checks on the deployed preview or production origin using a
fresh disposable browser profile. Do not use a real financial database.

## Verified

- Chrome and Safari local PWA persistence passed.
- Local PWA installation and offline persistence passed.
- Private browsing passed.
- All tested routes rendered except `/settings`; Settings did not display and
  requires investigation before Phase 5 route approval.

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
  - Current result: Partially passed. All tested routes except `/settings`
    rendered; physical-device testing is intentionally deferred until after
    mobile-first screen redesign.

- Real-device interaction
  - What: Touch and mobile browser behavior meet the Phase 5 acceptance bar.
  - How: Check current iPhone/iPad Safari and Android Chrome in portrait and
    landscape, including keyboard-open forms and safe-area edges.
  - Success: No clipped or overlapping content, touch targets are usable,
    focus remains visible, and no workflow depends on hover or gestures.
  - Current result: Deferred until Phase 5 mobile-first redesign.

- Cloudflare preview and production
  - What: Deployment, origin isolation, and rollback configuration work.
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
