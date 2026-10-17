# Phase 5: mobile-first UX proposal

Status: **design direction accepted; implement and review incrementally**

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
