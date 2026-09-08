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
