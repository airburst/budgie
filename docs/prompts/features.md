# New features to add

## Remember payee

I want to add a feature to autocomplete Payee as a user types, based on previous payees entered. This will require a new database table.

As well as autofill, if a user selects a previous payee from the dropdown, then we should also populate the category and amount from that last-used transaction.

Selection should work with keyboard (tab to select first item, up/down arrows to navigate list).

Add a payees table and hold the most recent transaction details for each distinct payee (payee, category, amount).

Also create a page to manage payees similar to categories. This will be accessed from a link in the Header bar setting icon (below categories). This page will allow for rows to be added, edited or deleted.

Finally, this entire feature should be optional, absed on a setting. We do not have a settings management page yet, so for now, add a key to the preferences JSON object: { autofillPayees: true }

## Reminders

### Auto-post payments

Rules

- Any reminder set with auto-post payment, which is due or passed, must be created as a transaction in the relevant account when the app starts.
- The auto-post checkbox should be augmented with an extra number input inside the border with label "Days in advance". This only shows if checkbox is checked. Use the number of days in advance for calculating whether to record the transaction. Likely needs a new table column; nullable
- After "recording" a reminder / scheduled payment, the next_due_date must be updated to the next calculated occurrence, and the reminders list sorted correctly

### Manually recording a scheduled payment

- The scheduled payments page needs a way to "Record" a payment
- Add an icon button to the end of row, with edit+delete
- Add a double-click handler on each body row in the scheduled payments table
- Build a reduced version of the ScheduledPaymentForm which:
  - does not include the Recurrence section; refactor that section out of the main dialog to make conditional rendering trivial
  - has a "Record" button at the bottom of form; actions are Cancel, Record, Edit, Delete
- When a user clicks the "record" icon, or double-clicks a row, show the reduced dialog without recurrence
- If they click "Edit" then include recurrence in form
