1. Release gate (PHASE4_MANUAL_CHECKLIST.md and the Phase 0 external validation). This is the main blocker for a public release:
   - Safari restart persistence and installed-PWA persistence.
   - Storage pressure and quota behaviour.
   - Exhaustive offline route coverage on a phone.
   - A performance baseline with a large dataset and bulk import on real devices.
   - Wider device coverage: iPad is untested and Android is a known gap. Firefox is deferred.
2. Production deployment (target plan §12):
   - Cloudflare Access policy, credentials, DNS and the production origin. A later domain change would strand each user's OPFS database.
   - A rehearsed v* tag deploy and a rollback to the previous artifact.
   - Electron and Pages built from the same tag.
3. Merging web-platform into main: main is still Electron-only. The shared-service bundle and web work need an Electron release plan, plus the version bump the maintainer runs.
4. Formal UX sign-off: the completion definition requires recorded approval for every view and modal. You've reviewed iOS/WebKit/Electron, but there's no per-route record. Phase 5's own acceptance bar also lists items I haven't run:
   - 200% text zoom.
   - A WCAG contrast and screen-reader pass.
   - The breakpoint matrix at -1/at/+1px.
   - WebKit automation, which can't run in this workspace.
5. Open product decisions:
   - Mixed-currency totals are summed without exchange rates (the plan flags this to review before multi-currency).
   - The credit-card sign convention is unchanged, pending your clarification.
   - Renaming "Subscriptions" to "Scheduled payments" (D9).
   - Web QIF import, which is hidden on web because there's no file-picker adapter. It's a separate approved slice if you want it.
6. Doc housekeeping: WEB_TARGET_PLAN.md §3.1 and WEB_IMPLEMENTATION_TASKS.md still say the next step is "design Phase 5", so they're stale.

Not part of this plan: hosted sync (SYNC_ENGINE_PLAN.md). It's a separate future effort that starts with a threat model and a PowerSync spike, and nothing there is started or authorised.

My suggested next step is item 1 plus item 2's deploy rehearsal, since they gate public release. I can turn the checklist into a runnable test script, or update the stale docs (item 6).
