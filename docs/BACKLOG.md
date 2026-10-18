# Backlog and open decisions

Not scheduled. Pick items up deliberately; each needs its own change.

## Product decisions

- Mixed-currency totals are summed without exchange rates; review before real
  multi-currency support.
- Credit-card sign convention is unchanged pending clarification.
- Rename "Subscriptions" to "Scheduled payments" (decision D9 in
  `docs/PHASE5_UX_PLAN.md`).
- Web QIF import: hidden on web because there is no file-picker adapter. A
  separate slice if wanted.

## Release and operations

- **Desktop auto-update fails on the private repo** (anonymous release feed
  returns 404, errors swallowed). Options: make the repo public (audit history
  for secrets/real data first), host the update feed publicly with the `generic`
  provider (e.g. R2 on a custom domain), or keep updates manual and surface a
  visible error plus a Releases link in About. Installed pre-fix apps keep the
  GitHub feed and need one manual install regardless.
- Electron export version is hard-coded: `portable:export` in
  `public/ipc/shared-services.js` stamps `applicationVersion: "0.16.3"`.
- Drop or promote the `spikes/powersync` sync spike with the sync decision.
- Release workflow publishes only after mac and Windows both build; consider
  building both on a pre-tag dry run.

## Quality

- Known gaps in `docs/PHASE4_MANUAL_CHECKLIST.md` (offline route pass, quota,
  performance baseline, Android/Firefox, accessibility pass).
- WebKit automation cannot run in CI here; Safari behaviour is verified by hand.
- Desktop-only IPC handlers are not covered by the web e2e suite; the
  integration suite drives them (`src/tests/integration/shared-services.test.ts`).

## Future (unauthorised)

- Hosted sync: `docs/SYNC_ENGINE_PLAN.md`. Starts with a threat model and a
  PowerSync spike; nothing there is started.
