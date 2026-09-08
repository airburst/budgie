import { useChartFillHeight } from "@/components/chart-card";
import { ChartLegend, useMeasuredHeight } from "@/components/chart-legend";
import {
  animatedRenderer,
  budgieChartTheme,
  type ChartConfig,
} from "@/components/chart-theme";
import {
  barY,
  defineChart,
  fold,
  group,
  type ChartPoint,
} from "@tanstack/charts";
import { RendererChart } from "@tanstack/charts/react/tooltip";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleBand, scaleLinear } from "d3-scale";

export type IncomeExpensesPoint = {
  month: string;
  income: number;
  expenses: number;
};

const config: ChartConfig = {
  income: { label: "Income", color: "hsl(160, 60%, 45%)" },
  expenses: { label: "Expenses", color: "hsl(0, 70%, 60%)" },
};

type Props = {
  data: IncomeExpensesPoint[];
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
  // One row per month/series pair, so the two bars can be dodged side by side.
  const rows = fold(data, {
    fields: ["income", "expenses"],
    as: { key: "series", value: "amount" },
  });
  const series = Object.values(config);
  const domain = series.map((entry) => entry.label);
  const range = series.map((entry) => entry.color);

  return defineChart({
    chart: () => ({
      marks: [
        barY(rows, {
          id: "income-expenses-bars",
          x: "month",
          y: "amount",
          // Colour by display label so the legend reads "Income", not "income".
          color: (row) => config[row.series]?.label ?? row.series,
          layout: group({ padding: 0.2 }),
          radius: 4,
        }),
      ],
      scales: {
        x: {
          scale: scaleBand,
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
      color: { domain, range },
      margin: { top: 8, right: 12, bottom: 32, left: 60 },
      theme: budgieChartTheme,
    }),
    focus: "group-x",
    tooltip: {
      use: tooltip,
      anchor: "group-center",
      placement: "auto",
      sort: "color-domain",
      content: (points: readonly ChartPoint<unknown>[]) => ({
        title: formatMonth(String(points[0]?.xValue ?? "")),
        rows: points.map((point) => ({
          label: String(point.group),
          value: formatAmount(Number(point.yValue ?? 0)),
          color: point.color,
        })),
      }),
    },
  });
}

export function IncomeExpensesChart(props: Props) {
  const fillHeight = useChartFillHeight();
  const [chartAreaRef, chartAreaHeight] = useMeasuredHeight<HTMLDivElement>();
  const legendItems = Object.values(config);

  if (!fillHeight) {
    return (
      <div className="flex flex-col items-center gap-4">
        <RendererChart
          definition={buildDefinition(props)}
          renderer={animatedRenderer}
          aspectRatio={16 / 9}
          initialWidth={520}
          className="w-full max-h-75"
          ariaLabel="Income versus expenses by month"
        />
        <ChartLegend items={legendItems} />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center gap-4">
      {/* Sized by flexbox alone, so the chart below measures its final space
          in one pass instead of an approximate height corrected after mount. */}
      <div ref={chartAreaRef} className="w-full min-h-0 flex-1">
        {chartAreaHeight > 0 ? (
          <RendererChart
            definition={buildDefinition(props)}
            renderer={animatedRenderer}
            height={chartAreaHeight}
            initialWidth={520}
            className="h-full w-full"
            ariaLabel="Income versus expenses by month"
          />
        ) : null}
      </div>
      <ChartLegend items={legendItems} large />
    </div>
  );
}
