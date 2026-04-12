# Upgrade Plan: lucide-react and recharts

These two dependencies were held back from the batch upgrade in April 2026 due to
widespread usage (lucide-react) and a breaking API rewrite (recharts). This document
tracks the migration plan for each.

---

## Phase 2 — lucide-react (0.577 → 1.x)

**Risk:** icon renames. 37 files import from lucide-react.

### Icons to audit

These are the names most likely to have changed at the 0.x → 1.x boundary:

| Current name       | Likely new name     | File                                  |
| ------------------ | ------------------- | ------------------------------------- |
| `HelpCircleIcon`   | `CircleHelpIcon`    | `src/pages/Forecast/ForecastPage.tsx` |
| `AlertTriangle`    | `TriangleAlertIcon` | `src/pages/Budget/EnvelopeRow.tsx`    |
| `CheckCircle2Icon` | `CircleCheckIcon`   | `src/pages/Home/AccountsTable.tsx`    |
| `CheckCircle`      | `CircleCheckIcon`   | `src/pages/Settings/BackupDialog.tsx` |
| `XCircle`          | `CircleXIcon`       | `src/pages/Settings/BackupDialog.tsx` |
| `EditIcon`         | `PencilIcon`        | `src/pages/Home/AccountsTable.tsx`    |

Names that are almost certainly stable: `ArrowLeftRight`, `Settings`, `Pencil`,
`Plus`, `Trash2`, `Copy`, `ChevronLeft/Right/Down/Up`, `X`, `XIcon`, `CheckIcon`,
`GripVertical`, `SearchIcon`, `CalendarIcon`, `FolderOpen`, `ReceiptText`,
`PanelLeftIcon`, `RefreshCwIcon`, `PencilIcon`, `PlusIcon`, `Trash2Icon`.

### Process

1. `bun add lucide-react@latest`
2. `bun run check-types` — TypeScript surfaces every missing export immediately
3. For each error, find the current name at https://lucide.dev/icons/
4. Fix all callsites (the grep output above is the full inventory)
5. `bun run lint && bun run check-types`

**Estimated effort:** 1–2 hours.

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
