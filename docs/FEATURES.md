# Budgeting app

## Core features

### Account management

- The Register: A digital version of a paper checkbook register that allows for easy manual entry and reconciliation.

- Add multiple types of account, e.g. bank, credit card

- Reconciliation with actual amount from statement

- Add scheduled payments and automatically add any due payments to registers for accounts

- Forecast view, taking scheduled payments into account over time. Default to next month, but allow user to change end date on line chart

### Core budgeting and tracking

- Hierarchical Categories: users can create broad categories (like "Utilities") and nest subcategories (like "Electric" or "Water") for granular tracking.

- QuickFill: A smart data-entry feature in the Register. The Payee field is a Combobox with autocomplete over previously used payees. When a pre-existing payee is selected, the Category and Amount fields are automatically populated with the values from the last transaction for that payee.

### File management

- Local SQLite database stored as a single file. The folder location defaults to a standard user data directory and can be changed in Settings.

- **TODO:** Backup files on daily basis / defined schedule / on closing app

- **TODO:** Ability to import a file and "roll back" to a previous state

- **TODO:** Import downloaded transactions in QIF or CSV format and present a matching view before importing and reconciling

## UX and layout

### Global layout

- Left sidebar with collapsible section: **Accounts** (grouped by type, e.g. Bank Accounts), each showing name and current balance.
- Top toolbar with icons for: save, open file, tools, settings, and help.
- Top navigation tabs across the main panel: **Overview**, **Accounts**, **Scheduled Payments**, **Budget**, **Reports**.
- Active tab is highlighted with a filled button style; others are plain text.

### Overview tab

- Net Worth displayed prominently in the top-right header with a time period selector (e.g. "This Month").
- Income / Expense / Difference summary panel on the left showing totals for the selected period.
- **Expenses by Category** donut chart on the right, with an interactive legend showing category name, amount, and percentage. Hovering/clicking a segment highlights it.
- **Choose Accounts** and **Choose Categories** filter buttons below the summary to scope the chart and totals.
- **Bills Due** panel showing total amount due and a scrollable table with columns: Date, Description, Amount, Status (e.g. "Due 3 days"). Rows marked with a green check circle indicate confirmed/scheduled items.
- **Budget** panel alongside Bills Due showing the current budget total or a "No Budget" state when none is configured.

### Accounts tab

- Page-level action toolbar: **View**, **Add**, **Edit**, **Delete**, **Import** (with a dropdown for format options).
- Accounts listed in a table grouped by account type (e.g. **Bank Accounts**), with columns: Account, Balance, Cleared Balance, Last Reconcile, Remaining Credit.
- Group subtotal row shown beneath each group.
- Positive balances displayed in green.

#### Add / Edit Account panel

Opens as a modal dialog with the following fields:

- **Account name** — text field, focused by default.
- **Account number** — text field.
- **Account type** — dropdown (e.g. Bank).
- **Initial balance** — numeric field, defaults to 0.00.
- **Website** — text field.
- **Notes** — multiline text area.
- **Cancel** and **Save** buttons at the bottom right; a **?** help button at the bottom left.

### Scheduled Payments tab

- Split layout: monthly **calendar view** on the left showing scheduled payment names on their due dates, and a **list view** on the right.
- Calendar has previous/next month navigation arrows and shows the month/year as a heading.
- List view columns: Date, Description, Amount. Rows with a green check circle are confirmed/recorded; unconfirmed rows have no icon.
- List extends across months, showing upcoming items beyond the current calendar view.
- Top-right **Search** bar to filter scheduled payments by name.
- Action toolbar: **Record** (mark as done), **Add**, **Edit**, **Delete**.

> **TODO:** Define Add/Edit Scheduled Payment dialog fields (to be specified via database schema and mocked before implementation).

### Register

Opened by clicking an account in the sidebar. Displays the full transaction list for that account.

- Action toolbar: **Add**, **Edit** (dropdown), **Reconcile**, **Forecast**, **Import** (dropdown), **Advanced Find…**
- Transaction table columns: Date, # (cheque/reference number), Payee, Withdrawal, Deposit, Category, Memo, Balance, **C** (cleared checkbox).
- Withdrawals shown in red; deposits and running balance in green.
- Selected row highlighted in blue.
- The **C** column has a checkbox per row to mark individual transactions as cleared during reconciliation.
- **QuickFill:** The Payee field uses a Combobox autocomplete. Selecting an existing payee auto-fills Category and Amount from the last recorded transaction for that payee.

> **TODO:** Define Add/Edit Transaction dialog fields (to be specified via database schema and mocked before implementation).

> **TODO:** Define Category management UI (create, edit, delete categories and subcategories).

#### Reconcile panel

Opens as a modal dialog triggered from the Register toolbar.

- **Last reconcile date** — read-only, shows the date of the previous reconciliation.
- **Statement end date** — date picker, pre-filled with today's date.
- **Statement balance** — numeric text field, focused by default; user enters the closing balance from their bank statement.
- **Cancel** and **Next** buttons at the bottom right; **?** help button at the bottom left.

- TODO: Handle imported QIF files. [technical spec](https://github.com/jemmyw/Qif/blob/master/QIF_references)

#### Forecast confirm panel

Small modal dialog triggered from the Register toolbar via the **Forecast** button.

- **Future date** — date picker, defaults to end of current month (e.g. 31/03/2026).
- **Cancel** and **Next** buttons; **?** help button at the bottom left.

#### Forecast view

Opens as a separate window after confirming the future date.

- Account name and number shown as the window heading.
- **Line chart** spanning from the current date to the chosen future date:
  - X-axis: dates, Y-axis: balance amounts.
  - Green line showing projected running balance.
  - Red horizontal line at zero for quick visual reference of negative balance risk.
- **Transaction list** below the chart with columns: Date, Payee, Withdrawal, Deposit, Category, Memo, Balance, and a blue inclusion checkbox per row.
- Projected transactions from scheduled payments are included automatically.
- Bottom toolbar: inline **date picker** to change the end date and a **Refresh** button to recalculate; **?** help button at the bottom left.
