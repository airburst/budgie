import { useChartFillHeight } from "@/components/chart-card";
import {
  animatedRenderer,
  budgieChartTheme,
  type ChartConfig,
} from "@/components/chart-theme";
import { barY, defineChart, type ChartPoint } from "@tanstack/charts";
import { RendererChart } from "@tanstack/charts/react/tooltip";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleBand, scaleLinear } from "d3-scale";

export type NetWorthPoint = {
  month: string;
  netWorth: number;
};

const config: ChartConfig = {
  netWorth: { label: "Net Worth", color: "hsl(220, 70%, 55%)" },
};

// Matches the income/expenses palette so gains and losses read consistently.
const POSITIVE = "hsl(160, 60%, 45%)";
const NEGATIVE = "hsl(0, 70%, 60%)";

type Props = {
  data: NetWorthPoint[];
  formatMonth: (month: string) => string;
  formatAmount: (value: number) => string;
  formatAxisAmount: (value: number) => string;
};

function buildDefinition({
  data,
  formatMonth,
  formatAmount,
  formatAxisAmount,
}: Props) {
  return defineChart({
    chart: () => ({
      marks: [
        barY(data, {
          id: "net-worth-bars",
          x: "month",
          y: "netWorth",
          fill: (point: NetWorthPoint) =>
            point.netWorth >= 0 ? POSITIVE : NEGATIVE,
          radius: 4,
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand().padding(0.35),
          axis: {
            line: false,
            ticks: { size: 0, padding: 8, format: formatMonth },
            tickLabels: { fontSize: 22 },
          },
        },
        y: {
          scale: scaleLinear,
          grid: true,
          axis: {
            line: false,
            ticks: { size: 0, padding: 4, format: formatAxisAmount },
            tickLabels: { fontSize: 22 },
          },
        },
      },
      margin: { top: 8, right: 12, bottom: 48, left: 90 },
      theme: budgieChartTheme,
    }),
    focus: "group-x",
    tooltip: {
      use: tooltip,
      anchor: "group-center",
      placement: "auto",
      content: (points: readonly ChartPoint<unknown>[]) => ({
        title: formatMonth(String(points[0]?.xValue ?? "")),
        rows: [
          {
            label: config.netWorth!.label,
            value: formatAmount(Number(points[0]?.yValue ?? 0)),
            color: points[0]?.color,
          },
        ],
      }),
    },
  });
}

export function NetWorthChart(props: Props) {
  const fillHeight = useChartFillHeight();
  return (
    <RendererChart
      definition={buildDefinition(props)}
      renderer={animatedRenderer}
      aspectRatio={fillHeight ? undefined : 3}
      height={fillHeight}
      initialWidth={720}
      className={fillHeight ? "w-full h-full" : "w-full max-h-62.5"}
      ariaLabel="Net worth over time"
    />
  );
}
