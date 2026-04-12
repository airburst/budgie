# budgie

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
