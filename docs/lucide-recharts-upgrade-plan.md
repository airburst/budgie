# Upgrade Plan: lucide-react and recharts

These two dependencies were held back from the batch upgrade in April 2026 due to
widespread usage (lucide-react) and a breaking API rewrite (recharts). This document
tracks the migration plan for each.

---

## Phase 2 — lucide-react (0.577 → 1.x) ✅ DONE (April 2026)

Upgraded to 1.8.0. `bun run check-types` passed with zero errors — lucide-react 1.x
preserved all icon names used in this codebase. No callsite changes were needed.

---

## Phase 3 — recharts (2.x → 3.x)

**Risk:** breaking API rewrite. 3 source files affected.

### Components in use

| File                                   | Recharts components                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/pages/Forecast/ForecastChart.tsx` | `LineChart`, `Line`, `CartesianGrid`, `XAxis`, `YAxis`, `ReferenceLine`                                    |
| `src/pages/Reports/ReportsPage.tsx`    | `AreaChart`/`Area`, `BarChart`/`Bar`, `PieChart`/`Pie`/`Cell`, `CartesianGrid`, `XAxis`, `YAxis`, `Legend` |
| `src/components/ui/chart.tsx`          | `import * as RechartsPrimitive` (wildcard — shadcn wrapper)                                                |

### Process

1. Read the recharts 3.x migration guide before touching anything.
2. **Regenerate the shadcn chart wrapper first:**
   ```
   bunx shadcn@latest add chart
   ```
   This rewrites `src/components/ui/chart.tsx` for recharts 3 and is the canonical
   starting point. Review the diff carefully before accepting it.
3. Fix `src/pages/Forecast/ForecastChart.tsx` — single `LineChart` with a custom SVG
   cursor (`TrackingCursor`). Verify that the tooltip still passes the same
   `points`/`payload` shape to the cursor component; this is the highest-risk piece.
4. Fix `src/pages/Reports/ReportsPage.tsx` — three chart types. Pay attention to
   whether `Cell` props or `PieChart dataKey` conventions changed.
5. Run the app visually after each chart fix — recharts breaking changes tend to
   produce silent mis-renders rather than runtime errors.
6. `bun run lint && bun run check-types`

**Estimated effort:** 2–4 hours, dominated by the `TrackingCursor` tooltip API risk.
