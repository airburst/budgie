# Upgrade Plan: lucide-react and recharts

These two dependencies were held back from the batch upgrade in April 2026 due to
widespread usage (lucide-react) and a breaking API rewrite (recharts). This document
tracks the migration plan for each.

---

## Phase 2 — lucide-react (0.577 → 1.x) ✅ DONE (April 2026)

Upgraded to 1.8.0. `bun run check-types` passed with zero errors — lucide-react 1.x
preserved all icon names used in this codebase. No callsite changes were needed.

---

## Phase 3 — recharts (2.x → 3.x) ✅ DONE (April 2026)

Upgraded to 3.8.1. Regenerated `src/components/ui/chart.tsx` via `bunx shadcn@latest add chart --overwrite`.
The shadcn wrapper needed two type fixes for recharts 3:

- `ChartTooltipContent` — props now typed against `DefaultTooltipContentProps` instead of `ComponentProps<Tooltip>`
- `ChartLegendContent` — props now typed against `DefaultLegendContentProps` instead of `Pick<LegendProps, "payload" | "verticalAlign">`

`ForecastChart.tsx` and `ReportsPage.tsx` required no changes.
