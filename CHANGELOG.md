# budgie

## 1.0.1

### Patch Changes

- 256aedb: Fix the Windows desktop build, which failed resolving the build output path.

## 1.0.0

### Major Changes

- f380f57: Budgie 1.0: runs as an offline-first web app (PWA) at budget.fairhursts.net alongside the desktop app, with a mobile-first interface and portable data export/import.

### Minor Changes

- 01989a2: Budget envelopes now display as cards on phones with category info, an explicit Save/Cancel assigned-amount editor, and Move up / Move down actions alongside drag reordering. Envelope and Move money forms open as bottom drawers, delete asks for confirmation, and "Fill from last month" moved into a More menu with a confirmation.
- 21e5c2a: Forecast now lists projected transactions as cards you tap to include or exclude, with a Details button for the full category and memo, wrapping controls and a content-sized Help drawer. Reports controls wrap on phones and every chart has a "Show values" list instead of relying on hover. Settings fits 320px screens with 44px tabs, and About opens as a bottom drawer on phones. Closing a form whose opener was removed now returns focus to the page heading.
- 5af9006: Subscriptions: Skip action on each card and in details (confirms first), wider payee column at the 1024px crossover, auto-post text hidden on desktop. Reconcile cards keep their height when selected. Forecast end-date calendar is full size on desktop and chart labels align with the cards. Reports charts are taller with a wider touch target on phones.
- 603a838: Mobile headers: the header bar now carries the page title, back arrow and primary action (Add account/subscription/category/payee) on phones; duplicate in-page headings removed. The phone menu ends with the app version instead of About.
- 5dc4089: Increase all text one size on phones (type scale shift below 768px); desktop unchanged.
- 62bdf1f: Add a versioned portable data package with validated import/export across Electron and the browser.

### Patch Changes

- 2007847: Accounts now display as cards with aligned balances. On smaller screens, account pages show a "Selected account" card with a Change account picker instead of the sidebar, and the account and reconcile forms open as bottom drawers on phones.
- a007aef: Vertically centre the contents of transaction and scheduled payment cards on wide screens.
- a81df98: Vertically centre the contents of forecast and reconcile cards on wide screens.
- d10d6a7: Deploy verified web artifacts to Cloudflare Pages with the security and isolation headers required for browser storage.
- a1f2fa2: Update dependencies, including TanStack Charts 1.x, React 19.3, Vite 8.3 and Electron 44.9.
- 5beef4a: Tapping Save or Cancel in a phone drawer now works on the first tap while the keyboard is open
- b9ca896: Keep the drawer Save/Cancel buttons above the phone keyboard while editing
- 8bf6ad7: Include the database service adapter in Electron packages so the desktop app can start.
- 7f9279b: Fix startup failure when upgrading a database that already has envelope category mappings.
- 30fc245: Serve the web manifest with the application/manifest+json content type.
- e56f086: Cloudflare previews deploy only from a manual workflow run, not on pull requests.
- f68cc57: Remove the visible "Budgie / Navigation" heading from the phone menu.
- 06b682c: Add mobile hamburger/sidebar navigation, safe-area-aware application sizing and larger phone button targets while retaining desktop navigation and native macOS title-bar spacing.
- afe4b31: Harden the web PWA build with deterministic offline precaching, security headers, and user-confirmed service-worker updates.
- ce1e35b: Fix portable imports failing when existing envelope category assignments have different public IDs.
- 42c0a7d: Fix the web app icon: PNG home-screen icons (apple-touch, 192/512, maskable), favicon and manifest now use the Budgie icon.
- 3978fab: Improve browser startup recovery and add offline PWA assets for the web target.
- adcbe4e: Reconcile, Categories and Payees now use mobile-friendly cards. Reconcile has a two-by-two summary, selectable cards and a fixed Cancel/Finish bar; categories keep their hierarchy and payees show their defaults. Tapping a category or payee opens details with an explicit Edit, deletes ask for confirmation, and the editors open as drawers on phones.
- f380f57: Release pipeline: tags must be on main, production deploy waits for lint/types/tests, previews are manual, Electron builds rebuild the services bundle, hashed assets are cached immutably.
- ac3ed6d: Delete and discard confirmations now open as a bottom drawer on phones, with Cancel focused first.
- 595da5f: Keep report plots and legends contained on phones and tablets, including fullscreen charts, and fit dialogs above the on-screen keyboard.
- 48331e1: Subscriptions now show as cards with separate Income and Outgoing totals for the next 7 days. The account filter applies to the list, totals and calendar, the calendar collapses behind a "Show calendar" button on phones, and a Sort menu replaces the column headers. Tapping a subscription opens its details; recording a payment is always an explicit action, and the editor and Record payment screens open as drawers on phones.
- ccae1f6: Group the Skip button with Edit and Delete on phone subscription cards.
- 2b4d1b3: On phones, tapping a transaction opens a read-only details drawer, with Edit as an explicit step into a full-height editor. Unsaved edits now ask before being discarded, and failed saves keep your changes with an error message.
- 12464d0: Replace the account transactions table with a mobile-first card list, add a labeled Filter popover and More actions menu to the transactions header, and allow transaction details to open on every screen size (not just phones).
- 6e78303: QIF import review, backup and restore now open as bottom drawers on phones (QIF review lists transactions as tappable cards), with inline errors and discard/double-submit protection. Portable data replacement keeps all warnings in a bottom confirmation, and the QIF Import action is no longer shown on the web app, where it cannot run.
- 95d440d: Make Settings available in the browser and hide filesystem-only backup and restore controls there.

## 0.16.3

### Patch Changes

- Auto Balance on the reconcile view now sets the payee to a fixed "Adjustment" and focuses the category field, instead of allowing payee selection to overwrite the auto-calculated amount

## 0.16.2

### Patch Changes

- Add an Auto Balance action to prefill reconciliation discrepancy transactions.

## 0.16.1

### Patch Changes

- 5d31e65: Remove obsolete electron-rebuild step from release CI workflow (better-sqlite3 is N-API and needs no rebuild; the step failed because node-abi doesn't know the Electron 44 ABI)

## 0.16.0

### Minor Changes

- a8c75af: Replace recharts with TanStack Charts across the Forecast and Reports pages.

  The Forecast line keeps its tracking hover label (no tooltip panel) and the red
  overdraft rule; Reports keeps the spending doughnut with its centred total, the
  grouped income/expenses bars and the gradient net worth area, now with spring
  entry animations. Charts vendor chunk drops from 417 kB to 183 kB.

### Patch Changes

- a8c75af: Upgrade dependencies: Electron 44, TypeScript 7, Vitest 5, React Router 8, TanStack Table 9,
  better-sqlite3 13, concurrently 10 and changesets 3, plus all outstanding minor/patch bumps.

  better-sqlite3 is now an N-API module, so the `electron-rebuild` / `npm rebuild` steps have
  been removed from install, build and test.

- a8c75af: Reports charts: larger, more readable legends; maximised charts now fill the available screen space instead of staying capped at their card height; the net worth trend is now a bar chart with green/red bars for gains/losses, wider gaps between bars, and larger axis labels; the spending donut's legend moves beside the chart (using the wide left gutter) with larger text when maximised; the income vs expenses legend now matches the donut's size and spacing; maximised charts reliably replay their entrance animation instead of snapping straight to full size.

## 0.15.0

### Minor Changes

- Add sortable columns to scheduled transactions table and default Record button date to today

## 0.14.1

### Patch Changes

- 494d80f: Fix scheduled transactions with "Once" frequency: they now show a "Once" badge (was "Daily") and are removed from the list once recorded, auto-posted, or skipped, since they will never occur again.

## 0.14.0

### Minor Changes

- Make subscriptions table sortable
- Update dependencies

## 0.13.0

### Minor Changes

- ab8280b: Add account filter to Subscriptions page - filter scheduled transactions by account with a popover dropdown and checkboxes

## 0.12.1

### Patch Changes

- Fix keyboard shortcut routing for Budget and centralize built-in shortcut definitions so Settings and runtime hotkeys stay in sync.
- Reorder Reconcile and Forecast buttons
- Increase accounts table footer height

## 0.12.0

### Minor Changes

- Add Skip button to RecordPaymentDialog to skip the next due transaction and advance to the following occurrence

## 0.11.1

### Patch Changes

- Update build script

## 0.11.0

### Minor Changes

- Auto-reconcile when transactions match balance

### Patch Changes

- 139d010: Upgrade react-day-picker to v10; keep recharts on v2 (v3 is incompatible with React 19)
- a5c65c4: Auto-match transactions during reconciliation when an exact combination is found

## 0.10.0

### Minor Changes

- aa711f5: Improved budget screen alignment; updated dependencies

### Patch Changes

- 7e4efce: Upgrade typescript to v7, plus other dependencies

## 0.9.8

### Patch Changes

- Downgrade recharts 3.8.1 → 2.15.4 to fix infinite render loop on forecast chart

  Recharts 3's internal Redux store dispatches state updates during component
  cleanup that React 19 rejects during the commit phase, causing an unrecoverable
  "Maximum update depth exceeded" crash on the forecast page.

## 0.9.7

### Patch Changes

- ae8a1e0: Fix infinite render loop on forecast chart after recharts 3 upgrade. Stabilise tooltip content and cursor to module-level references, and disable the now-default accessibilityLayer whose unmount cleanup was dispatching into recharts' internal Redux store during teardown.
- 1a41b68: Upgrade lucide-react 0.577 → 1.8.0. No icon renames required — all existing imports were preserved in the 1.x release.
- f7b6ca5: Upgrade recharts 2.15.4 → 3.8.1. Regenerated shadcn chart wrapper to use recharts 3 types (DefaultTooltipContentProps, DefaultLegendContentProps). No changes needed in application chart components.

## 0.9.6

### Patch Changes

- a3d24fa: Upgrade electron (40→41), vite (7→8), @vitejs/plugin-react (5→6), typescript (5→6), and shadcn CLI (3→4). Convert vite.config.ts manualChunks to function form required by Rollup's updated types.

## 0.9.5

### Patch Changes

- Forecast chart now shows a tracking cursor on hover: a vertical drop line from the x-axis to the data point, with the balance value and date displayed above the point.

## 0.9.4

### Patch Changes

- 9598f95: Focus the populated amount field when transaction dialogs are opened from a row double-click.
- 36f570f: Align transaction-style table rows so text, inputs, and icons appear vertically centered.

## 0.9.3

### Patch Changes

- 2ab450b: Backup retention policy now correctly applies the user-configured retention days when sweeping old backup files on close

## 0.9.2

### Patch Changes

- 162a02e: Reconcile page: suppress hover highlight on checked rows; double-click a row to open the edit dialog

## 0.9.1

### Patch Changes

- Fix running balance column: now anchors from the cleared balance and accumulates only uncleared transactions, so reconciled history is treated as settled and does not shift when transaction dates change
- Disable the cleared (C/R) checkbox for future-dated transactions in the register

## 0.9.0

### Minor Changes

- Add custom keybindings — a new Shortcuts tab in Settings lets you view and configure keyboard shortcuts
- macOS titlebar now uses a compact inset style
- Subscription hotkeys: keyboard shortcuts for recording and managing scheduled payments
- Add a GitHub changelog link to the About dialog

### Patch Changes

- Fix double-posting of counter-transactions when scheduled transfers are auto-posted
- Fix reconcile dialog showing a stale opening balance when returning to an in-progress session

## 0.8.6

### Patch Changes

- Update icon

## 0.8.5

### Patch Changes

- Fix auto-update by publishing GitHub releases (were stuck as drafts) and auto-publishing after CI builds

## 0.8.4

### Patch Changes

- Fix reconcile dialog showing wrong opening balance when an account has been reconciled multiple times on the same date

- Fix reconcile dialog showing wrong opening balance when multiple reconciliations exist for the same date

## 0.8.3

### Patch Changes

- Reminders card now shows the net amount due in the next 7 days instead of the total of all active scheduled transactions

## 0.8.2

### Patch Changes

- Fix auto-update on macOS: skip auto-download (requires code signing) and instead show a toast with a link to the GitHub releases page. Windows keeps the full auto-download and install flow.

## 0.8.1

### Patch Changes

- Payee combobox: pressing Tab while the dropdown is open now selects the first matching option and moves focus to the next field.

- Fix: changing a transaction's category to a transfer now correctly creates a mirror transaction in the target account. Previously this only worked when creating a new transaction; editing an existing one would leave the other account untouched. Also handles changing from one transfer destination to another (moves the mirror) and changing away from a transfer (removes the mirror).

## 0.8.0

### Minor Changes

- Auto-update: check for new versions on launch, notify via toast, backup and restart to install

## 0.7.0

### Minor Changes

- Reconciliation sessions now persist across interruptions: cleared checkboxes are written to the database immediately on each toggle (so navigating away and back preserves progress), and the statement date/balance entered in the dialog are saved to the account so they are pre-filled when you re-open it. The pending target is cleared once reconciliation is finished and balanced.

## 0.6.0

### Minor Changes

- Add theme (light/dark/auto) settings
- Add startup page settings

## 0.5.0

### Minor Changes

- Add about in settings and use/store payees in reminders form

## 0.4.0

### Minor Changes

- Added transaction boundary after today; fixed transaction form a11y

## 0.3.1

### Patch Changes

- Added changeset revisions
