# budgie

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
