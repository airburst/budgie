import {
  animatedRenderer,
  budgieChartTheme,
  seriesColor,
  type ChartConfig,
} from "@/components/chart-theme";
import {
  areaY,
  d3Curve,
  defineChart,
  lineY,
  type ChartPoint,
} from "@tanstack/charts";
import { RendererChart } from "@tanstack/charts/react/tooltip";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleLinear, scalePoint } from "d3-scale";
import { curveMonotoneX } from "d3-shape";

export type NetWorthPoint = {
  month: string;
  netWorth: number;
};

const config: ChartConfig = {
  netWorth: { label: "Net Worth", color: "hsl(220, 70%, 55%)" },
};

const NET_WORTH = seriesColor(config, "netWorth");
const GRADIENT_ID = "net-worth-gradient";

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
        areaY(data, {
          id: "net-worth-area",
          x: "month",
          y: "netWorth",
          curve: d3Curve(curveMonotoneX),
          fill: `url(#${GRADIENT_ID})`,
          // Stops already encode the fade; the default 0.2 would double-dim it.
          fillOpacity: 1,
        }),
        lineY(data, {
          id: "net-worth-line",
          x: "month",
          y: "netWorth",
          curve: d3Curve(curveMonotoneX),
          stroke: NET_WORTH,
          strokeWidth: 2,
        }),
      ],
      // Replaces the <defs><linearGradient> the recharts version declared.
      gradients: [
        {
          id: GRADIENT_ID,
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 1,
          stops: [
            { offset: 0, color: NET_WORTH, opacity: 0.3 },
            { offset: 1, color: NET_WORTH, opacity: 0.05 },
          ],
        },
      ],
      scales: {
        x: {
          scale: scalePoint,
          axis: {
            line: false,
            ticks: { size: 0, padding: 8, format: formatMonth },
          },
        },
        y: {
          scale: scaleLinear,
          grid: true,
          axis: {
            line: false,
            ticks: { size: 0, padding: 4, format: formatAxisAmount },
          },
        },
      },
      margin: { top: 8, right: 12, bottom: 32, left: 60 },
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
            color: NET_WORTH,
          },
        ],
      }),
    },
  });
}

export function NetWorthChart(props: Props) {
  return (
    <RendererChart
      definition={buildDefinition(props)}
      renderer={animatedRenderer}
      aspectRatio={3}
      initialWidth={720}
      className="w-full max-h-[250px]"
      ariaLabel="Net worth over time"
    />
  );
}
