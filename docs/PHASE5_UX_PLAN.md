# Phase 5: mobile-first UX proposal

Status: **Phase 5 implementation complete (5A-5I); manual review recorded below**

Date: 2026-10-17

This expands [the target plan, section 10](./WEB_TARGET_PLAN.md#10-phase-5-incremental-ux-redesign)
and [the screen audit](../screens.md). It does not change application behavior,
routes, schema, dependencies, or the existing desktop UI.

## 1. Review pack

Open the SVGs in a browser or VS Code image preview; zoom to read individual
screens. All figures are fictional. These are annotated visual wireframes, not
interactive prototypes or evidence of working keyboard avoidance.

1. [Accounts, account transactions, and account switching](./mockups/phase5-accounts.svg):
   three 390px-wide phone layouts.
2. [Subscriptions, budget, and reconciliation](./mockups/phase5-workflows.svg):
   three 390px-wide phone layouts.
3. [Details, editing with keyboard, and desktop](./mockups/phase5-overlays-desktop.svg):
   read-only bottom drawer, near-full-height editor, and aligned desktop cards.
4. [Hamburger navigation and sidebar](./mockups/phase5-navigation.svg):
   phone navigation opened from the header; no persistent bottom tabs.

The reference image supplies the account-card hierarchy, not a new banking
data model. Budgie records transaction dates, not transaction times or payment
rails. Do not invent "Card payment", timestamps, or a bank-sourced "available
balance". Use the existing computed balance, cleared balance, categories, and
cleared/reconciled states.

## 2. Recommendations and decision register

Mark reviewed the design on 2026-10-17 and accepted the root overview, aligned
cards (native desktop table semantics are not required), hamburger/sidebar
navigation, separate scheduled income/outgoing totals, and trying drawers for
long forms including recurrence. He does not want an extra direct-edit shortcut.
The register below records the resulting direction; remaining recommendations
are distinguished from explicit decisions.

| ID  | Decision for review                     | Recommended default                                                                                                                       | Why / alternative                                                                                                                                                                                     |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Does `/` remain an overview?            | Keep **All accounts** at `/`; selected-account card belongs on `/accounts/:id`.                                                           | The current root lists account balances. Making it a merged transaction feed is a separate feature, not responsive restyling. Do not silently open the first/last account.                            |
| D2  | Do cards replace desktop tables too?    | Yes: compact, column-aligned subgrid cards on desktop; multi-row cards on phones.                                                         | Matches the steering. Costs some density and native table semantics. Alternative: phone cards plus semantic desktop tables if column comparison is more important. Approve with the desktop mockup.   |
| D3  | How does primary phone navigation work? | Accepted: hamburger opens a navigation sidebar. Keep desktop top navigation.                                                              | No persistent bottom tabs. Sidebar includes Accounts, Subscriptions, Budget, Reports, Categories, Payees, Settings, About and capability-dependent actions.                                           |
| D4  | What happens to the mobile calendar?    | Keep it in a collapsed **Show calendar** disclosure above the list. Summary stays visible.                                                | Preserves functionality without pushing the list down. Omission is unnecessary. Date selection/filtering is not currently supported and is not introduced here.                                       |
| D5  | What is a whole-card tap?               | Account: navigate. Transaction/schedule: read-only details. Reconciliation: toggle selected. Forecast: toggle included.                   | One tap must not accidentally mutate a transaction or open the keyboard. Selection is workflow-specific, not a universal edit action.                                                                 |
| D6  | How tall are mobile drawers?            | Content-sized for short tasks; near-full-height for long forms. Desktop keeps centered dialogs.                                           | A uniformly short drawer cannot support recurrence or import review with a keyboard. No new editor routes initially. Short landscape viewports can also use the expanded layout.                      |
| D7  | How do we label money?                  | **Balance** and **Cleared balance**; credit accounts add **Remaining credit**.                                                            | "Available balance" implies bank semantics Budgie cannot guarantee. Preserve existing calculations and loan/payment terminology.                                                                      |
| D8  | How does the scheduled summary work?    | Accepted: show separate Income and Outgoing totals. Recommended: list, summary and calendar share the account filter, explicitly labeled. | Preserve the existing inclusive seven-day window and active-schedule rules. Sum positive amounts as Income; show the absolute total of negative amounts as Outgoing. Do not net income against bills. |
| D9  | Is "Subscriptions" the right label?     | Preserve the current title and navigation label initially.                                                                                | The view also contains recurring income/transfers. A global rename to "Scheduled payments" should be approved separately.                                                                             |

### Credit-card clarification

The question was about the headline's meaning, not a proposed sign inversion.
Recommendation: retain the existing signed **Balance** (debt is negative),
show **Cleared balance**, and show **Remaining credit** separately where a
credit limit exists. A positive balance means actual credit, not money owed.
Do not change stored values, arithmetic or loan/payment terminology. Mark
asked for clarification; no sign-convention change has been approved.

### Other accepted review answers

- No additional direct-edit shortcut: keep details first, then explicit Edit.
- Try near-full-height drawers for recurrence/import before considering editor
  routes. Keep desktop dialogs and the keyboard/dismissal acceptance gates.
- Root overview and compact aligned desktop cards are accepted. The collapsed
  calendar remains the proposed treatment under the overall positive review;
  validate it in the scheduled slice.

### Challenges to the steering

- Agree with replacing mobile sidebars, but not with a selected-account card
  masquerading as an all-accounts overview. Root needs an aggregate summary and
  account cards, not an arbitrary selected account.
- Agree with cards, but do not give every record a tall banking-app tile at
  desktop widths. Aligned, compact cards preserve scanning and comparison.
- Agree with whole-card taps, but selection and opening details are different
  actions. Reconciliation must keep its direct selection workflow.
- Agree with bottom drawers as an experiment. The swipe handle is not sufficient:
  explicit Close/Cancel, safe dismissal, scroll containment, focus restoration,
  keyboard reachability and short-landscape behavior are release requirements.
- Do not copy the blue outline in the reference as a permanent decorative border.
  Use it for keyboard focus or a real selected state.
- Preserve current light/dark preferences and Nunito Sans. The dark wireframes
  illustrate hierarchy, not approval for a new black-only theme.

## 3. Audit evidence and actual scope

| Surface          | Current evidence                                                                                                                                  | Required response                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root sizing      | `globals.css` uses `100vh` and `100vw`; there is no single explicit root `min-width` in the inspected source.                                     | Address intrinsic minimum sizing, viewport units and content overflow; don't just remove a nonexistent root declaration.                                                |
| Shell            | `header.tsx` is a three-column grid with unwrapped navigation and overflow clipping. It reserves `pl-20` for Mac **and iPhone/iPad** user agents. | Compact phone header, separate phone navigation; native title-bar inset only for Electron on macOS. Use platform capability/target plus OS, not Apple user agent alone. |
| Main scrolling   | `layout.tsx` scrolls main; several pages introduce another full-height scroll area.                                                               | One page scroll owner by default; explicit bounded desktop regions only where needed.                                                                                   |
| Accounts         | `AccountsMenu` is a non-shrinking `w-64` sidebar on home and account pages.                                                                       | Inline account context on phones, sidebar only with adequate space.                                                                                                     |
| Transactions     | Nine table columns, double-click editing, 28px toolbar buttons and immediate autofocus in the edit form.                                          | Multi-row cards, explicit details/edit states, larger touch targets, no automatic phone keyboard.                                                                       |
| Subscriptions    | `minmax(18rem,1fr) 3fr` page grid; calendar/summary always left; sortable table.                                                                  | Single-column phone layout; disclosure calendar; explicit mobile sort control.                                                                                          |
| Budget           | Toolbar combines three actions and month control; six-column subgrid already exists in `EnvelopeRow`.                                             | Reuse subgrid precedent, reflow the toolbar and card internals; add non-drag reordering.                                                                                |
| Reconciliation   | Four summary columns, wide table, whole-row selection and fixed bottom Finish bar.                                                                | Two-by-two phone summary, selectable cards, reserved safe-area action bar. Current audit PASS is not final acceptance.                                                  |
| Forecast         | Eight columns, chart above nested scroll, fixed bottom date/refresh toolbar.                                                                      | Phone cards, retain projected balance and include state, reflow controls; height-sensitive landscape testing.                                                           |
| Reports/settings | Reports header controls are unwrapped; charts and settings still need touch/keyboard checks.                                                      | Smaller layout work, not blanket PASS. Keep chart engine and existing storage warnings.                                                                                 |
| Overlays         | Existing Base UI `Dialog` is vertically centered; `Sheet` wraps Dialog, not the swipe-enabled Drawer. No Drawer is installed.                     | Introduce the official Base UI Drawer in the implementation phase, not a translated Dialog pretending to support swipe.                                                 |

Audited against [the route inventory](./WEB_ROUTE_MAP.md). No schema or financial
service redesign is needed for the proposed layout work.

## 4. Responsive shell and layout contract

### Width rules

- Base CSS is the phone layout; use only ascending `min-width` changes for
  responsive layout. No `max-width` media-query overrides or device sniffing.
- Start at **320 CSS px**, including 200% text and long user-entered content.
- At **640px / `sm`**, allow paired form fields and more toolbar room. This
  does not automatically turn a long form into a short dialog.
- At **768px / `md`**, use desktop top navigation and centered dialogs when
  height permits. Tablet portrait remains sidebar-free.
- At **1024px / `lg`**, restore optional account/calendar panels and aligned
  multi-column cards. Use `minmax(0, 1fr)` for the main region.
- At **1280px / `xl`**, allow secondary desktop columns and roomier padding,
  not a new minimum width. Breakpoints are proposed and must survive real data.
- Short viewport handling may use an ascending `min-height` enhancement:
  expanded editor is the safe base, centered dialog is enabled only with
  sufficient width and height. No phone/desktop detection based on touch alone.

### Structural rules

- Root uses available width (`100%`, not `100vw`) and a dynamic viewport-height
  strategy with a fallback. Flex/grid descendants need `min-w-0` and `min-h-0`
  at the actual shrink/scroll boundaries.
- Avoid global `overflow-x:hidden` as an overflow fix. Page content must fit.
- Phone gutters 16px; tablet/desktop 24-32px; record gaps 8px. No arbitrary
  narrow max-width around desktop data lists; constrain prose/forms separately.
- Normal phone pages scroll vertically as one surface. Bottom navigation and
  workflow bars reserve real layout space; the last record can scroll fully
  above them.
- Safe-area padding applies at the top, drawer/sidebar bottom and
  action bars. Verify the viewport metadata needed for edge-to-edge rendering
  during implementation; do not disable browser zoom.
- Primary phone navigation is a header hamburger opening the existing shadcn
  Base UI Sheet/sidebar pattern, with active-route indication and explicit
  Close. Selecting a destination closes it and navigates. There are no
  persistent bottom tabs. Keep account switching separate from global navigation.
- Reconciliation and forecast retain contextual task bars on phones.
  Back/Cancel remains explicit. Do not stack two fixed footers.
- Phone controls have at least 44x44px hit areas and 8px separation where
  practical. Prefer 48px primary actions. The current largest Button variant is
  only 36px; add shared responsive sizing rather than scattered page hacks.
- Names may wrap; amounts are tabular and right aligned. Never ellipsize money
  values. For exceptional magnitudes/text zoom, put the amount on its own
  full-width row rather than forcing horizontal scrolling.

## 5. Accounts and transaction experience

### `/`: All accounts

1. Page header **Accounts**, with visible **Add account** action.
2. Aggregate **Total balance** using the current overview calculation. Do not
   add currency conversion or call it available cash/net worth.
3. One account card per account. First line: name and computed balance.
   Secondary lines: account type/masked number when present, cleared balance,
   last reconcile; remaining credit only when applicable.
4. Whole card navigates to its account. A separate labeled overflow action
   exposes Edit and Reconcile; it must not trigger navigation.
5. Empty state offers Add account. Loading/error states are distinct from an
   empty account list.

**Existing mixed-currency risk:** current overview sums balances without FX.
This proposal must not broaden that financial meaning. Review whether to label
the existing total by currency or group it before shipping multi-currency
screens; do not invent conversion in this phase.

### `/accounts/:id`: Selected account

1. Compact context card: account name, optional masked number, Balance and
   Cleared balance. An explicit **Change account** button opens the chooser.
   Keep the card in normal document flow, not a tall sticky block.
2. Transactions heading with **Add** and **More**. More contains Reconcile,
   Forecast, Edit account and platform-supported import. Preserve direct
   desktop actions and keyboard shortcuts.
3. Existing cleared/reconciled filters remain available through a labeled
   Filter control with active-state summary. Do not add the reference's
   All/Money in/Money out chips or search without separate feature approval.
4. Transaction card hierarchy:
   - Primary: payee and one signed amount (not separate empty In/Out columns).
   - Secondary: date and category; status in plain words.
   - Optional tertiary: one-line notes preview and labeled running balance
     **only where current rules provide one**.
5. Preserve order, current future-date boundary, transfer behavior, cleared
   eligibility and reconciled immutability. Future records are explicitly
   labeled rather than silently mixed into today's activity.
6. Tap opens read-only details, including full notes and fields suppressed in
   the summary. Reconciled records remain readable but not editable/deletable.
   Edit is a deliberate second action. Clearing has a separate labeled
   control; a details tap never clears a record.

### Account chooser

Bottom drawer on phones, Base UI popover/combobox at larger widths. Show current
selection, account name, optional type/number and balance; offer **All accounts**
and **Add account**. Search is useful here for long account lists (a bounded
chooser affordance, not global transaction search). Retain focus on a heading
when opening, not the search input; typing starts only after an explicit tap.
Selection navigates to the existing route and closes the chooser. Cancel
leaves the selected account unchanged.

## 6. Card/subgrid implementation design

Use the existing `EnvelopeRow` subgrid approach as prior art. Reuse shadcn Card,
Button, Badge and installed Base UI wrappers rather than creating new primitives.
Share spacing/interaction helpers, not a universal schema-driven record renderer.

- Parent list defines common tracks; each direct card spans all tracks and
  uses `grid-template-columns: subgrid`. Keep the grid relationship intact
  through shadcn wrappers; a nested CardContent grid will not automatically
  inherit the list tracks.
- Phone track proposal: `minmax(0, 1fr) minmax(0, 9rem)`. Primary content and
  amount share the first row; metadata/notes use full-width subsequent rows.
  At 320px or enlarged text, long amounts may span both tracks.
- Wide transaction list: date / payee / category / signed amount / balance /
  status / actions. Notes can remain a secondary row or details-only.
- Wide account list: account / balance / cleared balance / last reconcile /
  remaining credit / actions. Wide scheduled list: due / payee / amount /
  frequency / account / actions.
- Consistent right-hand money tracks, `tabular-nums`, and shared parent columns
  align values across cards. Scope grouping containers carefully so subgrid
  alignment is not accidentally reset for each record.
- Keep scheduled TanStack sorting state/row model; replace its rendering layer.
  On phones, an explicit **Sort: Next due** menu replaces clickable headers.
  Preserve ascending/descending date, payee, amount and account sorting.
- Prefer semantic `ul/li` lists with meaningful per-record labels. Compact
  desktop captions are visual aids, not a fake ARIA table. If native table
  navigation is required, choose D2's desktop-table alternative instead.
- Whole-card interaction uses a real link/button covering the non-action area.
  Independent controls are siblings, not nested interactive elements.
  Reconciliation/forecast use a labeled checkbox with a card-wide label region;
  Edit/details are separate sibling buttons. No duplicate toggle from bubbling.
- Enter/Space behavior follows native controls. Selected state has text/check
  plus focus styling, never color alone. No double-click/hover-only dependency.

## 7. Other route designs

### Subscriptions `/scheduled`

Order on phones: title/Add, account filter, compact summary, Show calendar,
sort control, card list. Calendar is collapsed on initial phone entry; its
expanded state persists within the current view, not as a new preference.

Use existing **Due in next 7 days** and transaction count, but replace the
single net amount with **Income** and **Outgoing**. Sum positive amounts for
Income and absolute negative amounts for Outgoing; show zero explicitly for
an empty side. Preserve the existing window and next-due-date calculation:
this is not a new recurrence-expanded cash-flow forecast. Transfers retain
their existing signed scheduled-record treatment; do not double-count or
invent counterpart occurrences. List, summary and calendar use the selected
account scope under D8; label "All accounts" or "2 accounts".
Test mixed income/outgoing, one-sided, zero, paused and filtered fixtures.
Preserve active/paused behavior and recurrence
calculation; calendar dots still indicate next due dates, not every recurrence.

Cards show payee + signed amount, next due date, account, recurrence, paused/
auto-post status. Whole-card tap opens schedule details. **Record payment**
is explicit; Edit/Delete are separate actions. Neither tapping nor expanding
the calendar records money. Empty/filter-empty states differ.

Retain the calendar panel on desktop. Reuse the registry Calendar when replacing
the current bespoke calendar; don't introduce a second hand-built primitive.
Any new date-to-filter interaction is out of scope.

### Budget `/budget`

Order: title, month selector on its own row, Available to budget summary,
primary Add envelope / Move money actions, secondary **Fill from last month**
in More, envelope cards. Preserve current fill semantics; do not silently run it.

Phone envelope: name + available; full-width progress; Assigned / Spent below;
explicit edit/actions; category information available without hover. Long
names and negative amounts wrap safely. Near-full-height envelope editor retains
all existing category mappings. Assigned amount remains editable deliberately,
not by tapping the entire envelope.

Retain drag on a dedicated handle, never the whole card. Add Move up/Move down
actions using the same reorder mutation, disabled at boundaries. Keep any
existing desktop inline editing but prevent phone accidental blur-save by
using explicit Save/Cancel in the phone amount editor.

### Reconciliation `/reconcile/:id`

Two-by-two summary on phones: opening, cleared, statement, difference. Selected
cards have a check and **Selected** label; tap toggles once. Edit is separate.
Bottom task bar shows selected count, difference, Cancel and Finish.

Finish remains disabled unless the current reconciliation rules permit it;
the redesign must not loosen balance or pending-mutation checks. Preserve
auto-match feedback and auto-balance actions, even if moved to a task menu.
Leaving a pending reconciliation must respect existing state semantics.

### Forecast `/forecast/:id`

Keep chart and end-date/refresh behavior. Place controls in a wrapping section
or compact contextual footer, not a width-forcing toolbar. Cards show date,
payee, signed amount, projected balance, scheduled label, include state. Whole
card toggles inclusion; a distinct details action exposes full memo/category.
Keep Refresh's reset of inclusions explicit. No editing the real transaction
through a hypothetical forecast toggle.

### Categories and payees

Cards preserve category parent/child hierarchy with modest indentation and
visible parent context, not progressively narrower nested grids. Show type,
Add child, Edit and Delete through labeled actions. Payee cards show name,
default category and amount; full values are accessible in details/editor.
Phone tap opens details, with explicit Edit. Deletion remains confirmed.

### Reports and settings

Wrap date/account controls beneath the Reports heading. Charts are stacked
at base width and grow into the existing multi-column composition. Keep
TanStack Charts, shared theme helpers and touch inspection; no Recharts install.
Provide tap/keyboard-accessible values rather than hover-only tooltips.

Settings stays section-based; review tabs/controls at 320px, file input,
portable import/export status, theme and storage warnings. Backup/restore and
native updates remain capability-gated. The web QIF command currently has no
browser file-picker adapter: do not offer an enabled but unsupported action.
Portable JSON import/export remains the supported web transfer path. Adding
web QIF support requires its own approved slice.

## 8. Responsive overlay system

### Verified registry direction

The current [shadcn Base UI Drawer documentation](https://ui.shadcn.com/docs/components/base/drawer)
uses **Base UI, not Vaul**, and supports a swipe handle. At implementation:

1. Install with `bunx shadcn@latest add drawer` using the existing `base-nova`
   registry configuration. Review generated files and dependency changes.
2. Check installed Base UI version compatibility; do not infer availability
   from the documentation alone or add Vaul.
3. Compose Drawer on compact widths and existing Dialog on roomy widths,
   sharing one controlled open state and the form body/data logic.
4. Preserve draft values when viewport/orientation changes. Prefer form state
   above the presentation boundary; test that remounts do not reset it.
5. Use `showSwipeHandle` from the installed registry API, with visible Close.
   Don't hand-roll swipe or modal focus trapping.

The docs currently cap vertical drawers at `calc(100dvh - 6rem)` by default.
That is **not** a sufficient keyboard solution. Override sizing for long
editors. Their scrollable body must be a shrinkable flex item, not `h-full`
inside a content-sized drawer. The docs also call out a positioned `body` for
scrolled iOS Safari overlays; verify the generated integration on-device.

### Three states

**A. Details:** Content-sized bottom drawer; heading/status/amount and ordinary
text fields; Edit or Record payment in footer; no input focused and no keyboard.
Reconciled data has no edit action. Initial focus goes to a non-input heading
or safe close control, using the installed primitive's supported API.

**B. Editing:** Explicit Edit changes content inside the open surface, with
draft state retained. No autofocus on phone; tapping an input opens the
keyboard. Cancel returns to details for existing items and discards the draft
only through the defined dismissal policy. New forms open directly in editing.

**C. Keyboard-heavy editing:** Expand to almost the available visual viewport.
Header and Save/Cancel stay outside the scrolling form body. Use `dvh` and
safe areas first; verify visual viewport behavior on Safari/Chrome. Add a small
shared VisualViewport adapter only if device evidence requires it, never a
hard-coded keyboard-height subtraction. Active fields/errors must scroll into
view without moving actions behind the keyboard.

### Dismissal, focus and errors

- Explicit Close/Cancel everywhere, not swipe-only. Do not swipe-dismiss dirty
  editors without discard confirmation; clean details/choosers may dismiss.
- Cancel is the initial safe focus in destructive confirmation; Enter must not
  accidentally submit another underlying form. Escape/Back behavior must be
  verified with the router; do not let a drawer close silently leave the route.
- Trap focus, restore to the opener, lock background scroll, announce title and
  description. Test date-picker/combobox portals inside drawers for stacking,
  focus and scroll correctness.
- Save failures keep the drawer, entered values and actionable error visible.
  Prevent double submit, show pending state, do not close on failed mutations.
- Do not automatically reload a PWA update while a drawer is dirty/pending.
  Preserve existing explicit-update behavior.

### Complete overlay inventory

| Current workflow                              | Phone proposal                                                   | Desktop proposal                               |
| --------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| Account create/edit (home and account menu)   | Expanded drawer, single-column fields                            | Existing dialog                                |
| Transaction view/edit (account and reconcile) | Details drawer -> expanded editor                                | Details dialog -> current editor               |
| Account reconciliation setup (home/account)   | Short drawer; expand if necessary                                | Existing dialog                                |
| QIF import review                             | Expanded review drawer only where import is supported            | Existing dialog; native file boundary retained |
| Transaction/category/payee/schedule delete    | Bottom confirmation, safe Cancel and explicit destructive button | Existing AlertDialog                           |
| Category create/edit                          | Short drawer; grow for fields/errors                             | Existing dialog                                |
| Payee create/edit                             | Short or expanded drawer depending on visible fields             | Existing dialog                                |
| Scheduled create/edit, recurrence             | Expanded drawer with scrollable recurrence controls              | Existing wide dialog                           |
| Record payment                                | Details/confirmation drawer -> explicit amount editing           | Existing dialog                                |
| Forecast help                                 | Content-sized, scrollable information drawer                     | Existing dialog                                |
| About (header/settings)                       | Content-sized information drawer                                 | Existing dialog                                |
| Native backup/restore                         | Responsive drawer if compact Electron window; unavailable on web | Existing dialogs, capability gated             |
| Portable import replacement confirmation      | Explicit destructive bottom confirmation; retain all warnings    | Existing AlertDialog                           |
| Envelope create/edit/delete                   | Expanded editor; separate destructive confirmation               | Existing dialog                                |
| Move money                                    | Short drawer with From/To/Amount; expand with keyboard           | Existing dialog                                |
| New account chooser / More / filters / sort   | Chooser or short action drawer; no automatic search focus        | Existing Base UI popover/menu/combobox         |

Keep AlertDialog-equivalent semantics for destructive confirmations. Do not
blindly replace every Dialog/AlertDialog with an ordinary dismissible Drawer.
Verify the registry/installed Base UI supports the needed alert semantics before
migrating these; a properly sized AlertDialog is an acceptable exception if not.

## 9. Implementation sequence

Each slice includes tests, a user-facing changeset, clean `bun run lint` and
`bun run check-types`, and phone/tablet/desktop review before the next slice.
Do not implement the whole phase as a one-shot CSS sweep.

| Slice                        | Work and main files                                                                              | Approval / exit gate                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 5A Shell                     | `globals.css`, `layout.tsx`, `header.tsx`, shared control sizing, viewport/safe-area conventions | D3; all existing routes reachable at 320px; Electron traffic-light behavior retained             |
| 5B Overlay pilot             | Registry Drawer; shared responsive overlay; transaction details/edit pilot                       | D5-D6; physical phone keyboard, dirty dismissal, focus/portal tests pass before reuse            |
| 5C Accounts                  | `Home`, `AccountsTable`, `AccountsMenu`, selected account card/chooser, AccountForm              | D1-D2/D7; balances and account navigation unchanged                                              |
| 5D Transactions              | `AccountTransactions`, `TransactionsTable`, form/details, filters/actions                        | D2/D5; transfer/cleared/reconciled/future rules unchanged                                        |
| 5E Transfer                  | ImportDialog, DataTransferSection and native dialogs                                             | Capability visibility, replacement warnings, failure preservation; no unapproved web QIF feature |
| 5F Reconcile + directories   | ReconcilePage, Categories, Payees and associated forms                                           | Whole-card selection once; Finish guard unchanged; hierarchy and deletion confirmed              |
| 5G Scheduled                 | ScheduledTransactions, table/list, summary, calendar, recurrence/record forms                    | D4/D8-D9; sorting retained; filter scope and recording explicitly tested                         |
| 5H Budget                    | BudgetPage, EnvelopeRow, amount/envelope/move-money editors                                      | Reordering with touch, keyboard and menu; allocations and fill behavior unchanged                |
| 5I Forecast/reports/settings | Forecast list/controls, report controls/chart inspection, remaining info dialogs                 | Include/reset rules, touch chart values, all remaining overlays approved                         |

Keep the [route map](./WEB_ROUTE_MAP.md) current as approved interactions ship.
No new routes, financial calculations, sync/storage architecture or migration
is authorized by this design. No changeset is needed for this design-only pack.

## 10. Acceptance and verification plan

### Layout matrix

Test 320x568, 390x844, 430x932, 844x390, 768x1024, 1024x768 and 1440x900 CSS
viewports. Test around each breakpoint at -1/at/+1px. Treat these as content
tests, not claims of device simulation equivalence.

- No document/route horizontal overflow: scroll width <= client width + 1px.
- First and last cards/actions reachable above navigation/safe areas.
- Long names/notes/categories, no account number, negative/large amounts,
  credit/loan accounts, empty/filter-empty/loading/error and paused schedules.
- At 200% text/zoom, values remain readable and controls reachable; layout can
  collapse to more rows. No information available only by hover or color.
- Card action hit areas >=44x44px at phone width; text/control contrast meets
  WCAG AA; logical focus order and screen-reader names.
- Playwright bounding-box assertions for amount/action collisions and subgrid
  column alignment (within 1 CSS px) across short/long cards.

### Interaction regressions

- Card tap vs child action is exactly one action; keyboard Enter/Space works.
- Read-only opening does not focus an input; Edit alone does not summon phone
  keyboard; explicit input tap does. Reconciled transactions remain read-only.
- Clearing and forecast inclusion change only the intended record once.
  Future clearing restrictions, running balances and reconciliation guards hold.
- Schedule sort and account filters work in card rendering; filtered summary/
  calendar behavior changes only under approved D8. Recording never happens
  just by selecting a schedule.
- Save/Cancel, failed save, double-submit, dirty close, swipe, Back/Escape,
  orientation changes and nested pickers preserve the intended state.
- Reorder actions and drag produce the same persisted order; assignment edits
  and money movement retain existing validation and arithmetic.
- Native actions hidden on web, portable import/export still usable offline.
- Shell startup, update prompt, storage warning, inactive tab and error states
  remain reachable and do not cover primary actions.

### Validation levels

1. Targeted Vitest/Testing Library tests beside affected components; retain
   current account/reconciliation regression tests and domain service tests.
2. Playwright viewport journeys, overflow/hit-target/selection assertions and
   screenshots; use synthetic disposable data, never real financial records.
3. Chromium and WebKit automation for layout; real iPhone Safari and Android
   Chrome for keyboard, overscroll, swipe, safe areas and browser toolbar changes.
   Repeat iPad portrait/landscape and Electron smoke checks.
4. Offline reload and navigation after installation; existing web build-boundary
   verification. Run `bun run verify:web` and focused E2E on the release slice.
5. Product review records approve each route and overlay, including chosen
   deviations from these wireframes.

### Review outcome and next boundary

The root overview, card alignment, hamburger/sidebar navigation, separate
scheduled totals, no extra direct-edit shortcut and drawer-first approach are
recorded above. Credit-card sign behavior is unchanged pending clarification.
Remaining implementation details are tested and reviewed in their own slices,
not treated as approval to skip acceptance gates.

Mark subsequently approved building **5A: responsive shell and hamburger/sidebar
navigation**. That slice adds a compact phone header, a scrollable shadcn Base UI
Sheet for all navigation destinations, 44px minimum phone button targets,
dynamic viewport sizing and safe-area padding. Desktop navigation and
Electron-only macOS title-bar spacing are retained.

5A deliberately does not replace account/calendar panels, tables, forms or
workflow footers. Existing wide page content is contained by the main scroll
region, not claimed to be fully redesigned or mobile-approved. Those changes
remain in their corresponding slices.

Automated coverage includes header/capability/focus regression tests and
Playwright checks at 320px, landscape, the 768px navigation breakpoint,
desktop resizing and Apple web user agents. Physical-device safe-area and
native Electron title-bar checks still need manual review.

### 5B outcome: overlay pilot

Mark approved building **5B**. The official shadcn Base UI Drawer
(`src/components/ui/drawer.tsx`) is installed from the `base-nova` registry
against the existing `@base-ui/react` 1.8.0; no Vaul. The registry emitted an
`import { cn } from "cn"` that also added an unrelated npm package. That was
removed and the import points at `@/lib/utils`.

`src/components/responsive-overlay.tsx` composes Drawer below 768px and the
existing Dialog above it from one controlled `open` state. Content is
`auto` (content-sized) or `expanded` (full dynamic viewport less the top safe
area). The phone body is the only scrolling region; header and footer stay
fixed, and the footer pads for the bottom safe area. The drawer is wrapped in
Base UI's `Drawer.VirtualKeyboardProvider` rather than a custom VisualViewport
adapter. `useIsMobile` now reads `matchMedia` synchronously so overlays do not
mount as the desktop variant first.

The transaction form is the pilot:

- **Phone:** tapping a row (outside its checkbox/buttons) opens read-only
  details (state A, content-sized). Edit switches the same surface to the
  expanded editor (state B/C). Phones never autofocus: initial focus is the
  title, so neither opening nor Edit summons the keyboard. Reconciled
  transactions have no Edit.
- **Desktop:** behavior is unchanged in 5B. Pencil and double-click still
  open the editor directly, with existing autofocus. A desktop details dialog
  is deferred to 5D, together with the card rewrite.
- **Dismissal:** swipe, Escape, backdrop, the close icon and Cancel on a dirty
  draft all ask "Discard changes?" (Cancel focused). A cancelled swipe snaps
  the drawer back with the draft intact. Clean drafts dismiss immediately.
  Cancel from details-originated edits returns to details. Dismissal is
  ignored while saving.
- **Saving:** a ref guard prevents double submit. Failures keep the surface,
  the draft and a visible `role="alert"` error.
- **Viewport changes:** draft and mode survive crossing the 768px breakpoint
  because form state lives above the presentation boundary.

The discard confirmation reuses the existing centered `ConfirmDialog` (a
nested dialog), which is the accepted AlertDialog-style exception.

Automated coverage: `TransactionForm.test.tsx` (details-first, no
autofocus, reconciled read-only, dirty Escape/Cancel, failed save, double
submit, viewport change) and `e2e/phase5-overlay.spec.ts`. The Chromium
Playwright journey (390x844) covers bottom anchoring, expanded height, a
44px Save target, the date picker and combobox portals above the drawer,
Escape closing only the nested list, dirty swipe snap-back, save round-trip
and no horizontal overflow, plus unchanged desktop behavior. WebKit
automation cannot start the browser runtime (`window.api` never initialises,
on the base commit too), so iOS Safari keyboard, swipe and safe-area checks
remain a **manual physical-device gate** before reusing the overlay in 5C+.

### 5C outcome: accounts

- **Root `/`:** `AccountsTable` is now `AccountsList`. It shows an
  "All accounts · total balance" summary (the existing un-converted sum,
  labelled "Account balances, not available cash") and then one card per account.
  The cards share a parent grid through `subgrid`, so balance columns line up
  on every breakpoint. On phones, a card has the name, `Type · •• 1234` and the
  balance, plus a second row with Cleared, the last reconcile date and
  Remaining credit (credit cards with a limit only). At `lg` the same cells
  become aligned columns (Balance, Cleared, Last reconciled, Remaining credit),
  with a caption row above them.
- **Card interaction:** the account name is a stretched link, so tapping
  anywhere on the card navigates. Actions sit above the link (`z-10`) and never
  navigate. Below `lg` they are a 44px ••• menu (Edit account / Reconcile); at
  `lg` they are direct icon buttons. Loading (skeletons), error (`role="alert"`
  with Try again) and empty states are separate.
- **`/accounts/:id`:** below `lg` a "Selected account" context card replaces
  the sidebar. It shows the name, summary, balance, cleared balance and
  **Change account**. The `AccountsMenu` sidebar now appears only at `lg` and
  above, on both pages.
- **Account chooser:** a bottom drawer on phones and a popover on tablets.
  Neither autofocuses an input. It contains All accounts → Overview, the
  accounts (the current one is `aria-current` with "✓ Selected") and Add
  account. Search appears only from 6 accounts, because short lists are faster
  to scan. Choosing the current account or Close leaves the route unchanged.
- **Overlays:** `AccountForm` (expanded) and the reconcile setup (auto) now use
  `ResponsiveOverlay`. The account form gets the 5B dismissal rules: a
  dirty-draft discard confirmation, an ignored dismissal while saving, a
  double-submit guard and an inline save error. Its payloads are unchanged.
  Close-account remains a nested confirmation. Phones never autofocus. Desktop
  reconcile keeps the balance autofocus.

Automated coverage: unit tests for `account-display`, `AccountsList`,
`AccountChooser` and `AccountForm`, and `e2e/phase5-accounts.spec.ts`. That
spec covers tap navigation against the menu, 44px targets, column alignment,
no overflow at 320px, chooser close and select, the Select portal above the
drawer, the tablet popover and the desktop sidebar with aligned columns.

### 5D outcome: transactions

- **Header:** `/accounts/:id` now shows "Transactions" with a primary **Add**
  button and a labelled **Filter** button (a `Popover` holding the existing
  hide-reconciled/hide-cleared checkboxes, same preference keys). The Filter
  button's visible text and `aria-label` both summarise the active state (e.g.
  "Filter · Hiding cleared"), so the state is conveyed in text, not colour
  alone. Below `lg`, Reconcile/Forecast/Edit account/Import collapse into a
  single **More actions** `DropdownMenu`; at `lg` and above the direct buttons
  stay visible and More is hidden. The `f`/`r` hotkeys are unchanged.
- **`TransactionsTable` → `TransactionsList`:** the table became a `ul`/`li`
  subgrid card list, following the 5C `AccountsList` pattern. Phones show
  payee + one signed amount on the first row, then date · category · status
  text (never colour-only) plus a one-line notes preview and the running
  balance (only when the transaction isn't reconciled or cleared, matching
  prior table semantics). `lg` and above expose the same fields as aligned
  columns (date / payee / category / amount / balance / status / actions)
  with an `aria-hidden` caption row; amount and balance are `tabular-nums`
  and right-aligned across every card.
  - A stretched `<button>` labelled with the payee opens the existing
    read-only details flow at **every** width (previously phone-only);
    tapping the card never toggles the cleared control, which is a separate
    labelled sibling control (`aria-label="Mark {payee} cleared"`, 44px on
    phones) preserving the exact prior eligibility rules (reconciled rows
    can't be uncleared; future-dated rows can't be cleared).
  - Desktop keeps a direct pencil (`aria-label="Edit {payee}"`) that opens
    edit immediately; reconciled rows show neither edit nor delete, on every
    width. Delete remains behind the phone ••• menu when there's more than
    one action, or as a direct icon button at `lg`.
  - Future-dated transactions get an explicit "Upcoming" divider row (text,
    replacing the old border-only separator), shown only when the list mixes
    past and future transactions, matching the previous boundary condition.
- **Details everywhere:** `TransactionForm`'s `details` mode was already
  width-agnostic; only `AccountTransactions`'s `onView` handler was
  phone-gated, so ungating it was a one-line change — at `lg`+,
  `ResponsiveOverlay` renders the details view in a dialog instead of a
  drawer.

Automated coverage: `TransactionsList.test.tsx` (card button opens details,
cleared control doesn't, signed amounts, reconciled rows hide edit/delete,
notes preview, Upcoming label) and an extended `AccountTransactions.test.tsx`
(More menu contents, Filter summary text), plus `e2e/phase5-transactions.spec.ts`
covering phone card-tap-vs-cleared-tap, the More menu, the Filter popover
summary, 320px overflow, and desktop amount alignment, direct buttons, the
details dialog and the pencil edit. `e2e/phase5-overlay.spec.ts` was updated
to target the new card button and details dialog instead of table cells.

### Shared destructive confirmation (pre-5E–5H)

`ConfirmDialog` (`src/components/ConfirmDialog.tsx`) is now built on
`ResponsiveOverlay`: a bottom drawer on phones and the centered dialog from
`md`. Props are unchanged, so every existing caller got the phone treatment.
Cancel takes initial focus at every width (Enter never confirms; no keyboard
opens), and dismissal (swipe, Escape, backdrop) is a Cancel. It remains the
accepted nested-confirmation exception from 5B. Slices 5E–5H **reuse it for all
delete/discard/replace confirmations — do not add new confirmation components**.
Because the nested confirm is also a `drawer-popup`, e2e selectors for the
parent drawer must exclude `[data-nested]`.
Coverage: `ConfirmDialog.test.tsx` (phone and desktop) and the existing 5B–5D
e2e specs.

### 5E outcome: transfer

- **QIF review (`ImportDialog`):** now a `ResponsiveOverlay`. On phones it is an
  expanded drawer (title takes initial focus, no keyboard) whose body lists each
  parsed transaction as a whole-card `label` with a 44px+ checkbox target, payee
  (truncating), signed amount, date and a text status badge (New / Duplicate /
  Out of range). From `md` it is the existing wide dialog and review table.
  Matching, default selection and the created-transaction payload are unchanged.
  Added the 5B-5D behaviours: a changed selection asks "Discard import?" via the
  shared `ConfirmDialog` (clean reviews close at once), dismissal is ignored while
  importing, a ref guard prevents double submit, and a failure keeps the dialog
  open with a `role="alert"` message ("Import stopped after N of M: ...") instead
  of an unhandled rejection.
- **Capability visibility:** added a `qifImport` platform capability (Electron
  only; the web adapter has no file picker). The Import button and More-menu item
  on `/accounts/:id` are now hidden where it is false, so web no longer offers an
  enabled-but-unsupported action (this is a small edit in `AccountTransactions`).
  No web QIF support was added. Backup/Restore stay gated by `filesystemBackups`.
- **Native `BackupDialog` / `RestoreDialog`:** drawers on phones, dialogs from
  `md`, still Electron-only. Backup: labelled folder-browse button, double-tap
  guard, folder-load errors shown, dismissal blocked while a backup runs. Restore:
  backups are real `button`s (`aria-pressed`, 44px, name above metadata on phones,
  keyboard operable), the empty state is unchanged, and the destructive
  "Restore this backup?" confirmation reuses `ConfirmDialog` with its warning
  text unchanged. A failed restore now keeps the dialog and selection and shows
  an inline alert.
- **Portable import (`DataTransferSection`):** the "Replace local data?" confirmation
  is the shared `ConfirmDialog` (bottom drawer on phones, Cancel focused) with the
  description and "Importing replaces all local data" copy unchanged. Phone buttons
  stack full width; status is `role="status"` / `role="alert"`; errors and file
  names wrap at 320px. Export/import flow, reload-on-success and failure behaviour
  are unchanged. `SettingsPage.tsx` is untouched.

Automated coverage: `ImportDialog.test.tsx` (phone drawer/desktop table, cards,
discard, midway failure, double tap, type mismatch), `DataTransferSection.test.tsx`,
`NativeBackupDialogs.test.tsx` (phone and desktop, double tap, failure retention,
warnings), an `AccountTransactions` test for the hidden Import action, and
`platform.unit.test.ts`. `e2e/phase5-transfer.spec.ts` (Chromium) covers, on the
real web runtime, the bottom replacement confirmation (all warnings, Cancel
focused, 44px targets), failed import preserving data, Backup/Restore/Import not
offered, 320px overflow and the unchanged desktop dialog; and, with a synthetic
Electron `window.api` stub, the expanded QIF drawer, discard confirmation,
backup/restore drawers with restore failure retention, 320px overflow and the
desktop table/dialog. `e2e/phase5-transactions.spec.ts` now asserts Import is
absent on web.

**Manual gates left:** real Electron compact-window check of QIF review and
native backup/restore (the e2e uses a stub), and iOS Safari keyboard/safe-area
checks of the folder input and review drawer (WebKit automation cannot run).

### 5F outcome: reconcile + directories

- **Reconcile `/reconcile/:id`:** the table became a `ul`/`li` subgrid card
  list (phone: check / payee / amount, then date · category and Edit; `lg`: check /
  date / payee / category / amount / Edit with an `aria-hidden` caption row;
  amounts `tabular-nums` and right aligned). The summary is two-by-two on
  phones and one row from `lg`; Difference also says "Balanced" / "Not
  balanced" in text. Each card is one native checkbox with a card-wide
  `<label>` (stretched pseudo-element), so a tap toggles exactly once with no
  bubbling; a selected card shows a check, "Selected" text and a border, never
  colour alone. Edit is a separate sibling button (`z-10`) that opens the
  existing `TransactionForm` editor and never toggles. The `lg` double-click
  shortcut to edit is kept (ignored on buttons).
  - The fixed task bar now shows "N selected", Difference, Cancel and Finish.
    The page reserves its height plus `env(safe-area-inset-bottom)` so the last
    card scrolls clear, and the inner `h-full overflow-y-auto` scroller was
    removed (one scroll owner).
  - **Unchanged:** auto-match and its banner, Auto Balance and Add Transaction,
    the persisted cleared toggle, the balanced-only Finish with the pending
    mutation guard, the Enter/Escape/`n` hotkeys, and the `TransactionForm`
    props.
- **Categories:** the table is a flat `ul` of subgrid cards. Children follow
  their parent with a `ml-4` indent (`lg:ml-8`) and a left accent border;
  because the right-hand tracks are shared, actions and the type column stay
  aligned. Parent context is visible text ("Sub-category of X", "N
  sub-categories"). Tapping a card opens read-only details (type, parent,
  sub-categories) with an explicit Edit. Below `lg`, a 44px ••• menu holds
  Add sub-category (parents only), Edit and Delete; at `lg` they are direct
  labelled icon buttons. Delete stays disabled for a parent with children and
  says why. Delete uses `ConfirmDialog`.
- **Payees:** cards show name, default category ("No default category" when
  absent) and a signed default amount. Tap opens read-only details with Edit;
  ••• menu below `lg`, direct buttons at `lg`; delete uses `ConfirmDialog`.
- **Forms:** `CategorySheet` (auto height, grows for errors) and `PayeeForm`
  (expanded) use `ResponsiveOverlay` with the 5C `AccountForm` rules: no
  phone autofocus, a dirty-draft "Discard changes?" confirmation, dismissal
  ignored while saving, a double-submit guard and an inline `role="alert"` save
  error. Payloads are unchanged. A category with a blank name can no longer be
  created (Save is disabled, as payees already did).
- **Shared:** `SearchBox` gets a 44px phone input and clear target. The
  Categories/Payees pages lose their `max-w-3xl` wrapper per the layout contract.

Deviations: Edit from details closes the details surface and opens the
editor (it does not return to details on Cancel as 5B transactions do), because
these are two small independent overlays. Wide Reconcile notes show as a line
under the payee rather than a column.

Automated coverage: `ReconcileCards.test.tsx` (selection toggles once from the
label and checkbox, Selected text, Edit separate, Finish guard, auto-match,
pending), `Categories.test.tsx`, `Payees.test.tsx`, `CategoryForm.test.tsx`,
`PayeeForm.test.tsx`, the unchanged `ReconcilePage.test.tsx`, plus
`e2e/phase5-reconcile.spec.ts` and `e2e/phase5-directories.spec.ts` (390px
selection-once with persisted state, 2x2 summary, 44px targets, last card above
the task bar, 320px no-overflow with long names and amounts, hierarchy, details
then Edit, confirmed deletes, discard guard, and desktop column alignment).

### 5G outcome: scheduled

- **Page (`/scheduled`):** phones show title/Add, an account filter, the
  compact summary, a collapsed **Show calendar** disclosure, an explicit
  **Sort: Next due** menu, then the card list. The disclosure is collapsed on
  every entry; its open state is plain page state, not a preference. From `lg`
  the sidebar-style panel (calendar, summary) and the aligned cards return.
  The two arrangements are chosen with a new `useMinWidth(1024)` hook so each
  component renders once (no duplicated summary/calendar in the DOM).
- **Account scope (D8):** one filter drives list, summary and calendar (they
  previously ignored it for summary/calendar). It is labelled in text: "All
  accounts", the account name, or "N accounts". The page now stores the
  _excluded_ accounts, so a refetch (e.g. after recording a payment) no longer
  resets the filter. Empty ("No subscriptions yet." + Add) and filter-empty
  ("No subscriptions for {scope}." + Show all accounts) states differ.
- **Summary:** "Due in next 7 days" keeps the inclusive window, active-only
  rule and count, but shows **Income** (sum of positive) and **Outgoing**
  (absolute sum of negative) separately, never netted, with `£0.00` shown
  explicitly for an empty side. Logic lives in `summarizeDueSoon`
  (`scheduled-display.ts`) with fixed-time tests for mixed, one-sided, zero,
  paused, window-edge and filtered fixtures.
- **Calendar:** now the registry `Calendar` in non-interactive mode (no day
  buttons, so no date-to-filter interaction). Dots are a modifier on active
  schedules' next due dates and are labelled for assistive tech ("payment
  due"). Nav buttons are 44px below `lg`.
- **`ScheduledTable` → `ScheduledList`:** TanStack sorting state, sorted row
  model and the null-last date sort are unchanged; only rendering changed to
  `ul`/`li` subgrid cards. Phone: payee + signed amount, then one wrapping line
  of next due · recurrence · account (plus Paused / Auto-post as text), then
  **Record payment** and separate 44px Edit/Delete buttons. `lg`: due / payee /
  amount / frequency / account / actions in shared tracks, `tabular-nums`,
  right-aligned amounts. Each value is rendered once and moved with grid
  placement. A stretched button over the payee opens read-only details at every
  width; the actions are sibling controls above it. Delete uses the shared
  `ConfirmDialog` and names the subscription.
- **Sort:** the menu offers date, payee, amount and account in both
  directions (radio items that close on selection) at every width; desktop
  clickable column headers were dropped in favour of this single control
  (captions are an `aria-hidden` visual aid).
- **Overlays:** `ScheduledPaymentDialog` is now one `ResponsiveOverlay` with
  details and edit states (like 5B/5D). Card tap opens read-only **details**
  (Close / Edit / Record payment); Add and the pencil open the **expanded**
  editor directly. The editor has the 5B dismissal rules (dirty-draft discard
  via `ConfirmDialog`, Cancel returns to details, dismissal ignored while
  saving), a double-submit guard, inline field errors instead of a silently
  disabled Save, a `role="alert"` save error, no phone autofocus and
  single-column fields below `sm`. Recurrence controls got 44px phone targets
  and wrap at 320px. `RecordPaymentDialog` starts on phones in a read-only
  **confirmation** (payee, signed amount, date, account, category) with
  Record payment / Change amount / Skip / Cancel; **Change amount** switches to
  the expanded editable form with the same discard rule. Desktop still opens the
  editable dialog directly. Recording, skipping and failure handling reuse the
  existing amount/next-due logic, now with a ref guard and a visible error that
  keeps the surface open. A last-occurrence note warns that recording or
  skipping a one-off removes the schedule (existing behaviour, now stated).
- **Removed on purpose:** the double-click-to-focus-amount shortcut, and the
  Edit/Delete buttons inside the Record payment dialog (the card and details
  carry them), so nothing money-related hides behind a hover or double-click.
  `FrequencyBadge` is reused on cards.

Automated coverage: `scheduled-display`, `ScheduledSummaryCard`,
`ScheduledList` (all eight sort orders), `ScheduledTransactions` (disclosure,
ordering, shared filter across list/summary/calendar, empty vs filter-empty,
card tap vs explicit record), `ScheduledPaymentForm` and `RecordPaymentDialog`
unit tests, plus `e2e/phase5-scheduled.spec.ts` (390px phone, 320px overflow
including the editor drawer, 1280px desktop: totals, filter, calendar
disclosure, sort, 44px targets, aligned columns, record only via the explicit
action). Chromium only; physical-device keyboard checks remain a manual gate.

### 5H outcome: budget

- **Phone order:** title (sr-only; the header shows it), month selector on its
  own row (44px prev/next with labels), an "Available to budget" summary card
  with a text state (over-assigned / fully assigned / amount to assign),
  primary **Add envelope** and **Move money**, then envelope cards. **Fill from
  last month** sits in a **More actions** menu below `lg` and is a direct button
  at `lg`+. It now opens a `ConfirmDialog` and reports the result inline
  ("Filled N envelopes…" / "Nothing to fill…"); the quick-fill semantics (only
  envelopes with no allocation this month are filled) are unchanged.
- **Envelope cards:** `EnvelopeRow` is a `li` on a parent subgrid. Phones show
  name + Available, categories as text (the hover tooltip is gone), a
  full-width progress bar, then Assigned / Spent, a ••• menu and the drag
  handle. `lg`+ shows aligned columns (Envelope, Assigned, Progress, Spent,
  Available, actions) with a caption row. Names wrap; negatives keep their
  sign (`-£30.00`); "Underfunded" is text, not just an icon.
- **Assigned amount:** only the explicit value button (44px) starts editing,
  never the card. Phones get an inline editor with **Save** / **Cancel**, no
  autofocus and no blur-save; empty input shows an inline error; failed saves
  keep the editor with the draft; double submit is guarded. Desktop keeps the
  inline input (autofocus, Enter/blur saves, Escape cancels).
- **Reordering:** drag stays on the dedicated handle (pointer sensor with a
  4px activation distance, plus a keyboard sensor). The ••• menu adds **Move up**
  / **Move down**, disabled at the ends. Drag, keyboard drag and the menu all
  go through one `persistOrder`, sending `{id, sortOrder: index}` for every
  envelope to the same `reorder` mutation. A failed save reverts and shows an
  alert; each move is announced in a polite live region.
- **Overlays:** `EnvelopeFormDialog` and `MoveMoneyDialog` are now controlled
  `ResponsiveOverlay`s owned by `BudgetPage` (no embedded triggers). The envelope
  editor is expanded, keeps every category mapping (including "(mapped)"
  disabling) and the existing save sequence. Move money is a short drawer with
  From / To (shadcn Select) / Amount / Notes. Both follow the 5B rules: no phone
  autofocus, dirty discard via `ConfirmDialog`, ignored dismissal while saving,
  double-submit guard and inline errors. Delete is a nested `ConfirmDialog`
  (Cancel focused). The onboarding "Create from scratch" opens the page's form;
  applying a template is guarded against double taps.
- **Unchanged:** allocation, transfer, create/update/delete/reorder payloads
  and arithmetic. New envelopes still get `sortOrder: 0`.

Automated coverage: `BudgetPage`, `EnvelopeRow`, `EnvelopeFormDialog` and
`MoveMoneyDialog` tests, plus `e2e/phase5-budget.spec.ts` (phone 390: order,
44px targets, Fill confirmation, menu reorder persisting across reload, amount
Save/Cancel without blur-save, Move money drawer, envelope editor and delete
confirm; 320px overflow with long names; tablet; desktop alignment, inline edit,
keyboard and mouse-handle reorder). Real touch-drag on a physical phone and
on-device keyboard behaviour remain manual checks.

### 5I outcome: forecast, reports, settings

- **Forecast (`/forecast/:id`):** chart, end-date picker and the explicit
  Refresh (which still resets all inclusions) are unchanged. The table became a
  `ul`/`li` subgrid card list (phone: check / payee + "Included" or "Excluded
  from forecast" text / signed amount, then date · "Scheduled", then projected
  balance and a separate Details button; `lg`: check / date / payee / category /
  amount / balance / Details with an `aria-hidden` caption row). Each card is one
  native checkbox with a card-wide `<label>` (stretched pseudo-element), so a tap
  toggles exactly once; Details is a sibling `z-10` button and never toggles.
  Excluded cards show "—" for the balance in text. Scheduled rows stay italic
  and are also labelled "Scheduled". Details (`ForecastDetails`) is a read-only
  `ResponsiveOverlay` with the full date, amount, balance, status, source,
  category and memo; Close takes initial focus (no keyboard). Toggling or opening
  details never edits the real transaction or schedule.
  - **Layout:** the nested `overflow-y-auto` scroller and the fixed footer were
    removed. The page is one scroll surface (the main region) and the controls
    (Help, end date, Refresh) are a `sticky bottom-0` bar at the end of the
    content, so they reserve real layout space, wrap if needed instead of forcing
    width, use `env(safe-area-inset-bottom)`, and never stack with another fixed
    footer. Short landscape (844x390) keeps one row of about 56px.
  - **Help:** `ForecastHelp` is a content-sized information drawer on phones and
    the dialog from `md` (copy updated for tapping a card and Details).
- **Reports (`/reports`):** padding is 16px on phones. The date-range and account
  controls wrap under the heading (a labelled `group`) with 44px phone targets;
  the date select now shows "Last 90 Days" rather than the raw "90". Charts stack
  at base width and keep the existing `md` two-column composition. Every chart
  gets a **Show values** disclosure (`ChartValues`, a shadcn Collapsible) listing
  the plotted numbers as text (category amount and share, income and expenses per
  month, net worth per month), so nothing depends on hover or the chart tooltip.
  The Net Worth chart's 22px axis labels now apply only to the maximised card
  (they made the phone chart unreadable); the maximise buttons got accessible
  names. Chart engine, `chart-theme.ts` and the smoke tests are unchanged.
- **Settings:** reviewed at 320px. The nested scroller was removed (one page
  scroller), tabs are 44px on phones, Theme/Open-on-launch rows wrap, the
  autofill row is a 44px target, and the native folder browse buttons are
  labelled. Native backup/restore/folder settings stay capability-gated (absent
  on web), portable import/export from 5E is untouched and no web QIF action was
  added. **About** (`AboutDialog`) is a content-sized information drawer on
  phones (Close focused) and the dialog from `md`.
- **Focus restoration:** Chromium already returned focus to the opener after
  menu-opened forms (account, category, payee, envelope) were cancelled or saved,
  so no per-form wiring was needed. The remaining gap was an opener that no
  longer exists (e.g. a deleted card), which dropped focus to `<body>`.
  `ResponsiveOverlay` now moves focus to the page `h1` when an overlay finishes
  closing and nothing holds focus. Covered by `responsive-overlay.test.tsx`.

**Final overlay inventory audit** (outside `src/components/ui`): every form,
details, confirmation and information surface now goes through
`ResponsiveOverlay` or `ConfirmDialog`; no screen imports `Dialog`,
`AlertDialog` or `Drawer` directly. Intentional exceptions:

| Surface | Why it stays |
| --- | --- |
| Header navigation `Sheet` (5A) | Global navigation is a sheet by design; not a form. |
| Account chooser, transaction filter and scheduled account filter popovers, `DatePicker` popover | Plan inventory keeps Base UI popover/menu/combobox for choosers (a drawer on phones for the account chooser per 5C); no form data. |
| `DropdownMenu` actions | Menus, not overlays that hold forms. |
| `ChartCard` maximised view | A bespoke full-screen chart view (portal, Escape, labelled buttons), not a dialog or form. It could move to an expanded `ResponsiveOverlay` later if a focus trap is wanted. |

Automated coverage: `ForecastPage.test.tsx` (future rows only, signed amounts,
projected balances, scheduled label, single toggle from label and checkbox,
exclusion recalculating later balances, Details without toggling, Refresh reset,
help drawer and dialog), `chart-values.test.tsx` and the three chart tests
(values lists), `AboutDialog.test.tsx` (phone and desktop), and
`responsive-overlay.test.tsx` (menu opener focus, removed-opener fallback,
no focus theft on mount), plus `e2e/phase5-forecast.spec.ts` (390 toggle-once with
no change to real transactions, Details drawer with the full memo and no
keyboard, Refresh reset, single scroller and sticky controls with 44px targets,
last card above the bar, help drawer, 320px overflow and compact controls with a
long payee and huge amount, 844x390 landscape, desktop column alignment and
dialogs), `e2e/phase5-reports.spec.ts` (controls under heading, 44px targets,
stacked cards, tap and keyboard values, 320px overflow, desktop two-column) and
`e2e/phase5-settings.spec.ts` (320px tabs/targets, web hides native and QIF
actions, single scroller, About drawer and dialog). `phase5-shell.spec.ts` now
expects the About drawer on phones. Chromium only.

**Remaining manual gates:** real iOS Safari and Android Chrome checks of the
sticky Forecast bar (safe area, browser toolbar changes, blank inset below the
bar at the end of the scroll), the Details/Help/About drawers and the Reports
disclosures; Electron smoke (Settings tabs, About, backup/restore); touch drag
reorder from 5H; WebKit automation (cannot run here). With these, Phase 5
implementation is complete pending manual device gates.

### Manual review outcome (2026-10-17)

Mark reviewed the merged result by hand:

- **5B overlay pilot:** passed on a physical device before 5C+ reused the overlay.
- **WebKit / iOS Safari:** gestures and overlays looked good.
- **Electron:** smoke test passed after the fixes below.
- **ChartCard maximised view:** works well as it is. The documented exception
  stands; it is not moved to `ResponsiveOverlay`.
- **Not recorded:** Android Chrome, the sticky Forecast bar's end-of-scroll safe
  area inset, and touch-drag reorder on Budget were not separately reported.

Issues found while testing, fixed on `web-platform`:

- **Migration `0013`** (#9): `ADD created_at ... DEFAULT (CURRENT_TIMESTAMP)` on
  `envelope_categories` fails once the table has rows, so databases with envelope
  mappings could not start (empty test databases passed). The column is now added
  plain, existing rows are backfilled, and an insert trigger supplies the default.
  `migration-upgrade.test.ts` upgrades a populated database to guard this.
- **Row centring** (#10 and follow-up): transaction, scheduled, forecast and
  reconcile cards used `items-start`, so at `lg` the text sat a few pixels above
  the action buttons that set the row height. They now use `lg:items-center`
  (phone multi-row layouts are unchanged), with a desktop e2e assertion on each
  that the amount shares the card's vertical centre.

### Large-dataset review (2026-10-18)

Mark imported a large export on phone/iPad and desktop and reported the issues
below; all fixed in one PR except the two that need a physical device.

- **Subscriptions skip:** Skip is now a visible icon on every card (beside Record on
  phones, in the action cluster on desktop) and a button in the details surface.
  Both confirm first (shared `ConfirmDialog`, `confirmVariant="default"`) and say
  where the due date will move; a last occurrence warns it removes the schedule.
  Cards without a next due date offer no Skip. Chosen over an ellipsis menu so no
  action is hidden behind an extra tap.
- **Crossover squash:** at `lg` the two-pane page left the payee ~56px wide. `lg` now
  has four columns (due / payee / amount / actions) with frequency and account on a
  second line under the payee; the six-column row starts at `xl`. e2e at 1024px.
- **Desktop status:** auto-post text is dropped at `lg+` (cards are one row at `xl`);
  Paused stays as a badge beside the payee. Phones keep the status line.
- **Reconcile growth:** the "Selected" text line made selected cards taller. Removed;
  the native checkbox, tint and border carry the state. e2e asserts equal height.
- **Forecast calendar:** the popover shrink-wrapped to the 10rem trigger. `DatePicker`
  now has a calendar-sized minimum and the calendar fills it.
- **Forecast chart:** the left margin fits the widest y label so labels start at the
  card edge.
- **Reports on phones:** charts use a squarer aspect (1.25), `touch-action: pan-y`,
  and `maxFocusDistance` 120 so a fingertip need not land on a bar.

Deferred until captures/device are available (not verifiable here, no WebKit):

- Reports charts overflowing their labels in WebKit (worst on iPad).
- iPad landscape: the on-screen keyboard covers ~33% of the screen and hides most of
  the reconcile dialog (low priority).

### Phone headings and navigation (2026-10-18)

Pages mixed visible h1s, in-content back arrows and Add buttons under a header bar
that already showed the title. On phones (`< md`) the header bar now owns all three:

- **Root pages** (Accounts, Subscriptions, Budget, Reports, Categories, Payees,
  Settings): hamburger, title, and the page's primary action on the right (Add
  account, Add subscription, New Category, New Payee). The h1 stays for screen
  readers (`sr-only`). Reports keeps its filters at the top of the content;
  Budget and Reports have no action.
- **Drill-down pages** (Forecast, Reconcile): a back arrow replaces the hamburger,
  and the title is `Forecast — <account>` / `Reconcile — <account>`. Reconcile's
  statement line and its Auto Balance / Add Transaction buttons stay in content.
- **Settings** is a root page on phones (no back arrow).
- **Transactions** keeps its in-content h1, Filter and More actions (unchanged).
- **From `md`** nothing changes: pages draw their own heading and buttons.
- **Menu:** "About Budgie" is gone from the phone menu; a small centred
  `Version x.y.z` closes it. About stays in the desktop settings menu.

Mechanism: `components/page-chrome.tsx`. `Layout` wraps the header and page in a
`PageChromeProvider`; pages render `<PageHeader title onBack />` and wrap their
action in `<HeaderAction>`, which portals into the header's right-hand slot on
phones and renders in place otherwise (one DOM copy, never a hidden duplicate).
`<PageHeader>` must be rendered inside `<Layout>` since the page component itself
sits outside the provider. e2e: `phase5-header.spec.ts`.

### Phone type scale (2026-10-18)

No base font size was set (root and body compute to 16px) and Tailwind's type scale
is rem theme variables. Below `md`, `src/index.css` now remaps `--text-xs…--text-3xl`
(and line heights) to the next step up, so text is one level larger on phones while
rem-based spacing, icons and 44px targets are unchanged. Desktop is untouched.
Inputs, textarea and the search box moved from `text-base md:text-sm` to `text-sm`
(16px on phones, 14px from `md`), keeping fields at 16px so iOS Safari doesn't zoom
on focus. Chart text (SVG px) and the calendar's `text-[0.8rem]` are not Tailwind
steps and are unchanged. e2e: `phase5-typography.spec.ts` (scale values, 16px
fields, no overflow at 320px).
