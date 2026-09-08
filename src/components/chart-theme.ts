import type { ChartColorLegend, SceneNode } from "@tanstack/charts";
import { motion } from "@tanstack/charts/motion";

/**
 * Series metadata shared by every chart: a display label and the colour used
 * for that series. Kept as the same shape the recharts-era charts used, so
 * page-level config objects carry over unchanged.
 */
export type ChartConfig = Record<string, { label: string; color: string }>;

/** Chart chrome (axes, gridlines) tracks the app's CSS variables. */
export const budgieChartTheme = {
  foreground: "var(--muted-foreground)",
  grid: "var(--border)",
  background: "transparent",
} as const;

/** Turns a `ChartConfig` into the `{ domain, range }` pair TanStack colours by. */
export function chartColorScale(config: ChartConfig) {
  const entries = Object.entries(config);
  return {
    domain: entries.map(([key]) => key),
    range: entries.map(([, series]) => series.color),
  };
}

/** Looks up a series colour, falling back to the chart foreground. */
export function seriesColor(config: ChartConfig, key: string) {
  return config[key]?.color ?? budgieChartTheme.foreground;
}

/**
 * Spring entry animation used by the Reports charts. Forecast renders without
 * a renderer so its line never animates under the cursor.
 */
export const animatedRenderer = motion({
  initial: "always",
  transition: { type: "spring", stiffness: 170, damping: 18, mass: 1 },
});

export const chartMargin = {
  top: 8,
  right: 12,
  bottom: 32,
  left: 60,
} as const;

/**
 * `colorLegend()` from `@tanstack/charts/legend` renders 11px labels and 4px
 * dots — noticeably smaller than the recharts legend it replaced. This is the
 * same categorical layout at a size that matches the old chart legends.
 */
export function readableColorLegend(options?: {
  itemWidth?: number;
  placement?: "top" | "bottom";
}): ChartColorLegend {
  const minimumItemWidth = Math.max(80, options?.itemWidth ?? 130);
  const columnsFor = (itemCount: number, width: number) =>
    Math.max(
      1,
      Math.min(itemCount || 1, Math.floor(width / minimumItemWidth) || 1),
    );

  return {
    placement: options?.placement,
    height(itemCount, { chart }) {
      const columns = columnsFor(itemCount, chart.width);
      const rows = Math.ceil(itemCount / columns);
      return 12 + rows * 26;
    },
    render({ colors, bounds, theme }) {
      const domain = colors.domain;
      const columns = columnsFor(domain.length, bounds.width);
      const itemWidth = bounds.width / columns;
      const children: SceneNode[] = [];
      domain.forEach((value, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = bounds.x + column * itemWidth;
        const y = bounds.y + 13 + row * 26;
        const key = String(value);
        children.push(
          {
            kind: "dot",
            key: `legend-dot:${key}`,
            x: x + 6,
            y,
            radius: 6,
            style: { fill: colors.map(value) },
          },
          {
            kind: "label",
            key: `legend-label:${key}`,
            x: x + 18,
            y,
            text: key,
            baseline: "middle",
            fontSize: 13,
            style: { fill: theme.foreground, fillOpacity: 0.85 },
          },
        );
      });
      return {
        kind: "group",
        key: "legend",
        className: "ts-chart__legend",
        ariaHidden: true,
        children,
      };
    },
  };
}
