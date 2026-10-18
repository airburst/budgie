import { useChartFillHeight } from "@/components/chart-card";
import { ChartPlot } from "@/components/chart-plot";
import { ChartValues } from "@/components/chart-values";
import {
  animatedRenderer,
  budgieChartTheme,
  CHART_FOCUS_DISTANCE,
  CHART_TOUCH,
  PHONE_ASPECT,
  type ChartConfig,
} from "@/components/chart-theme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { barY, defineChart, type ChartPoint } from "@tanstack/charts";
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

/** `large` is the maximised card, which draws bigger axis labels. */
function buildDefinition(
  { data, formatMonth, formatAmount, formatAxisAmount }: Props,
  large: boolean,
) {
  const tickLabels = { fontSize: large ? 22 : 12 };
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
            tickLabels,
          },
        },
        y: {
          scale: scaleLinear,
          grid: true,
          axis: {
            line: false,
            ticks: { size: 0, padding: 4, format: formatAxisAmount },
            tickLabels,
          },
        },
      },
      margin: large
        ? { top: 8, right: 12, bottom: 48, left: 90 }
        : { top: 8, right: 12, bottom: 28, left: 56 },
      theme: budgieChartTheme,
    }),
    focus: "group-x",
    maxFocusDistance: CHART_FOCUS_DISTANCE,
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
  const isMobile = useIsMobile();
  const chart = (
    <ChartPlot
      definition={buildDefinition(props, Boolean(fillHeight))}
      renderer={animatedRenderer}
      aspectRatio={fillHeight ? undefined : isMobile ? PHONE_ASPECT : 2}
      height={fillHeight}
      maxHeight={isMobile ? 320 : 250}
      initialWidth={720}
      className={cn("w-full", CHART_TOUCH)}
      ariaLabel="Net worth over time"
    />
  );
  if (fillHeight) return chart;
  return (
    <div className="flex flex-col">
      {chart}
      <ChartValues
        title="Net worth"
        rows={props.data.map((point) => ({
          label: props.formatMonth(point.month),
          values: [{ value: props.formatAmount(point.netWorth) }],
        }))}
      />
    </div>
  );
}
