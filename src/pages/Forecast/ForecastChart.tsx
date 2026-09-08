import {
  budgieChartTheme,
  chartMargin,
  seriesColor,
  type ChartConfig,
} from "@/components/chart-theme";
import { defineChart, dot, lineY, ruleX, ruleY, text } from "@tanstack/charts";
import { whenFocused } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleLinear, scaleUtc } from "d3-scale";
import { format } from "date-fns";

export type ChartPoint = {
  date: string;
  balance: number;
};

type Row = ChartPoint & { at: Date };

const chartConfig: ChartConfig = {
  balance: { label: "Balance", color: "#22c55e" },
};

const BALANCE = seriesColor(chartConfig, "balance");
const OVERDRAWN = "#ef4444";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const formatCurrencyFull = (value: number) =>
  value.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

function parseDate(value: string): Date {
  const [y, m, d] = value.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/**
 * The hover label tracks the focused point rather than opening a tooltip
 * panel. Under recharts this needed pixel maths in a custom cursor; here the
 * same two decisions — flip the label below a high point, and pull it inside
 * the right edge — fall out of where the datum sits in each domain.
 */
function buildDefinition(rows: readonly Row[]) {
  const balances = rows.map((row) => row.balance);
  const low = Math.min(0, ...balances);
  const high = Math.max(0, ...balances);
  const span = high - low || 1;

  const first = rows[0]?.at.getTime() ?? 0;
  const last = rows[rows.length - 1]?.at.getTime() ?? 1;
  const timeSpan = last - first || 1;

  // Points in the top 15% of the plot have no room for a label above them.
  const labelBelow = (row: Row) => (row.balance - low) / span > 0.85;
  // Points in the last 15% would push a start-anchored label off the edge.
  const labelAtEnd = (row: Row) => (row.at.getTime() - first) / timeSpan > 0.85;

  return defineChart(
    {
      marks: [
        ruleY([0], {
          id: "zero-line",
          stroke: OVERDRAWN,
          strokeWidth: 1.5,
          strokeDasharray: "4 4",
        }),
        lineY(rows, {
          id: "balance-line",
          x: "at",
          y: "balance",
          stroke: BALANCE,
          strokeWidth: 2,
        }),
        whenFocused(
          ruleX(rows, {
            id: "focus-guide",
            x: "at",
            stroke: budgieChartTheme.foreground,
            strokeWidth: 1,
            strokeDasharray: "4 4",
            strokeOpacity: 0.6,
          }),
        ),
        whenFocused(
          dot(rows, {
            id: "focus-dot",
            x: "at",
            y: "balance",
            r: 3.5,
            fill: BALANCE,
          }),
        ),
        whenFocused(
          text(rows, {
            id: "focus-value",
            x: "at",
            y: "balance",
            text: (row: Row) => formatCurrencyFull(row.balance),
            fill: "var(--foreground)",
            fontSize: 11,
            fontWeight: 600,
            anchor: (row: Row) => (labelAtEnd(row) ? "end" : "start"),
            dx: (row: Row) => (labelAtEnd(row) ? -8 : 8),
            dy: (row: Row) => (labelBelow(row) ? 16 : -8),
          }),
        ),
        whenFocused(
          text(rows, {
            id: "focus-date",
            x: "at",
            y: "balance",
            text: (row: Row) => format(row.at, "d MMM"),
            fill: budgieChartTheme.foreground,
            fontSize: 10,
            anchor: (row: Row) => (labelAtEnd(row) ? "end" : "start"),
            dx: (row: Row) => (labelAtEnd(row) ? -8 : 8),
            dy: (row: Row) => (labelBelow(row) ? 26 : -20),
          }),
        ),
      ],
      scales: {
        x: {
          scale: scaleUtc,
          axis: {
            line: false,
            ticks: {
              size: 0,
              padding: 8,
              format: (value: Date) => format(value, "dd MMM"),
            },
          },
        },
        y: {
          scale: scaleLinear,
          grid: true,
          axis: {
            line: false,
            ticks: { size: 0, padding: 4, format: formatCurrency },
          },
        },
      },
      margin: chartMargin,
      theme: budgieChartTheme,
    },
    {
      svgAnimation: false,
      focus: "group-x",
    },
  );
}

type Props = {
  chartData: ChartPoint[];
};

export function ForecastChart({ chartData }: Props) {
  const rows: Row[] = chartData.map((point) => ({
    ...point,
    at: parseDate(point.date),
  }));

  return (
    <Chart
      definition={buildDefinition(rows)}
      height={256}
      initialWidth={720}
      className="w-full"
      ariaLabel="Forecast balance over time"
    />
  );
}
