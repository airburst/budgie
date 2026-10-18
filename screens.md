# Screen migration to mobile-first

## Routes

Entire main container has a min-width

/ All accounts. Misnamed as "Dashboard". FAIL: left panel with Account switcher
/accounts:id Selected account. FAIL: left panel with Account switcher
/reconcile:id PASS
/forecast:id. PASS: BUT: table columns could reduce

/scheduled Subscriptions FAIL: left panel with calendar. Could collapse calendar
/budget Budget bars FAIL: buttons area too wide
/reports PASS
/settings PASS

## Dialogs

Presentation: a bottom sheet on mobile and a centred dialog on desktop.

https://ui.shadcn.com/docs/components/base/drawer?utm_source=chatgpt.com#swipe-handle

### Keyboard avoiding height

State A — Viewing transaction details
Open the bottom sheet with no input focused. Show transaction fields as ordinary text, with an Edit button. The software keyboard should remain closed.

State B — Editing
When the user explicitly chooses Edit, enable editable fields. Only open the keyboard when they tap a text or numeric input. Keep Save and Cancel accessible above the keyboard.

State C — Keyboard-heavy editing
If the form is long, expand the sheet to nearly full-screen or switch to a full-screen editor. This gives the form room to scroll and avoids squeezing the content into a small remaining area.

### Occurrecnce

Home --> AccountForm[Account form dialog]
Home --> ReconcileDialog[Reconciliation dialog]
Accounts --> TransactionForm[Transaction form dialog]
Accounts --> ImportDialog[Import dialog]
Accounts --> AccountReconcile[Reconciliation dialog]
Accounts --> DeleteTransaction[Delete confirmation]
Categories --> CategoryForm[Category form]
Categories --> DeleteCategory[Delete confirmation]
Payees --> PayeeForm[Payee form]
Payees --> DeletePayee[Delete confirmation]
Scheduled --> ScheduledForm[Scheduled payment dialog]
Scheduled --> RecordPayment[Record payment dialog]
Scheduled --> DeleteScheduled[Delete confirmation]
Reconcile --> ReconcileTransaction[Transaction form dialog]
Forecast --> ForecastHelp[Forecast help dialog]
Settings --> About[About dialog]
Settings --> Backup[Backup dialog]
Settings --> Restore[Restore dialog]
Settings --> ImportConfirm[Import confirmation]
Budget --> EnvelopeForm[Envelope form dialog]
Budget --> MoveMoney[Move money dialog]
