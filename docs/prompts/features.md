# New features to add

## Remember payee

I want to add a feature to autocomplete Payee as a user types, based on previous payees entered. This will require a new database table.

As well as autofill, if a user selects a previous payee from the dropdown, then we should also populate the category and amount from that last-used transaction.

Selection should work with keyboard (tab to select first item, up/down arrows to navigate list).

Add a payees table and hold the most recent transaction details for each distinct payee (payee, category, amount).

Also create a page to manage payees similar to categories. This will be accessed from a link in the Header bar setting icon (below categories). This page will allow for rows to be added, edited or deleted.

Finally, this entire feature should be optional, absed on a setting. We do not have a settings management page yet, so for now, add a key to the preferences JSON object: { autofillPayees: true }

## Reconcilation

Screen is too small; show running totals, etc.

## Distribution and auto-update

https://www.electron.build/auto-update

Create S3 bucket with https

Test with minio

Mac code signing: https://www.electron.build/code-signing
