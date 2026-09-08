---
"budgie": minor
---

Replace recharts with TanStack Charts across the Forecast and Reports pages.

The Forecast line keeps its tracking hover label (no tooltip panel) and the red
overdraft rule; Reports keeps the spending doughnut with its centred total, the
grouped income/expenses bars and the gradient net worth area, now with spring
entry animations. Charts vendor chunk drops from 417 kB to 183 kB.
