---
"budgie": patch
---

Fix the desktop Reports page: Spending by Category and Income vs Expenses were empty because the date-range query returned raw database rows (including deleted transactions) instead of the shared transaction shape.
