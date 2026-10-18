import { useChartFillHeight } from "@/components/chart-card";
import { ChartLegend, useMeasuredHeight } from "@/components/chart-legend";
import { ChartPlot } from "@/components/chart-plot";
import { ChartValues } from "@/components/chart-values";
import { animatedRenderer, budgieChartTheme } from "@/components/chart-theme";
import { defineChart, type ChartPoint } from "@tanstack/charts";
import {
  focusGroupAngle,
  pie,
  polar,
  radialArc,
  radialText,
} from "@tanstack/charts/polar";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleLinear } from "d3-scale";

export type SpendingSlice = {
  name: string;
  amount: number;
  fill: string;
};

type Props = {
  slices: SpendingSlice[];
  total: string;
  formatAmount: (value: number) => string;
};

function sliceMetric(datum: unknown) {
  if (!datum || typeof datum !== "object") return undefined;
  const name = Reflect.get(datum, "name");
  const amount = Reflect.get(datum, "amount");
  return typeof name === "string" && typeof amount === "number"
    ? { name, amount }
    : undefined;
}

function buildDefinition(
  slices: readonly SpendingSlice[],
  total: string,
  formatAmount: (value: number) => string,
) {
  const arcs = pie(slices, {
    value: "amount",
    startAngle: Math.PI / 2,
    endAngle: (-Math.PI * 3) / 2,
    gapAngle: 0.02,
  });

  return defineChart({
    chart: () => ({
      marks: [
        polar({
          radiusRatio: 0.8,
          // radialText binds the angle/radius scales; the arcs carry their own
          // absolute angles from pie() and ignore them.
          scales: {
            angle: { scale: scaleLinear().domain([0, 1]) },
            radius: { scale: scaleLinear().domain([0, 1]) },
          },
          marks: [
            radialArc(arcs, {
              id: "spending-slices",
              key: "name",
              // 50%/80% radii under recharts -> 0.625 of the outer radius here.
              innerRadius: (layout) => layout.radius * 0.625,
              color: "name",
              stroke: "var(--background)",
              strokeWidth: 1,
            }),
            // Running total sits in the doughnut hole, as it did under recharts.
            radialText([{ label: total }], {
              id: "spending-total",
              angle: 0,
              radius: 0,
              text: "label",
              fill: "var(--foreground)",
              fontSize: 18,
              fontWeight: 600,
              anchor: "middle",
              baseline: "middle",
            }),
          ],
        }),
      ],
      scales: { x: null, y: null },
      color: {
        domain: slices.map((slice) => slice.name),
        range: slices.map((slice) => slice.fill),
      },
      margin: 0,
      theme: budgieChartTheme,
    }),
    focus: focusGroupAngle,
    tooltip: {
      use: tooltip,
      anchor: "group-center",
      placement: "auto",
      sort: "color-domain",
      content: (points: readonly ChartPoint<unknown>[]) => {
        const point = points.find((candidate) => sliceMetric(candidate.datum));
        const metric = point && sliceMetric(point.datum);
        return metric
          ? {
              title: metric.name,
              rows: [
                {
                  label: "Spent",
                  value: formatAmount(metric.amount),
                  color: point.color,
                },
              ],
            }
          : { rows: [] };
      },
    },
  });
}

export function SpendingDonut({ slices, total, formatAmount }: Props) {
  const fillHeight = useChartFillHeight();
  const [chartAreaRef, chartAreaHeight] = useMeasuredHeight<HTMLDivElement>();
  const totalAmount = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const legendItems = slices.map((slice) => ({
    label: slice.name,
    color: slice.fill,
  }));
  return (
    <div
      className={
        fillHeight
          ? "flex h-full min-h-0 w-full min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:gap-8"
          : "flex min-w-0 flex-col items-center gap-4"
      }
    >
      <div
        ref={chartAreaRef}
        className={
          fillHeight ? "min-h-0 min-w-0 flex-1 w-full" : "w-full min-w-0"
        }
      >
        <ChartPlot
          definition={buildDefinition(slices, total, formatAmount)}
          renderer={animatedRenderer}
          height={fillHeight ? chartAreaHeight || undefined : undefined}
          square
          initialWidth={300}
          className="w-full"
          ariaLabel="Spending by category"
        />
      </div>
      <div
        className={
          fillHeight
            ? "max-h-[35%] shrink-0 overflow-y-auto lg:max-h-full lg:max-w-[35%]"
            : "w-full min-w-0"
        }
      >
        <ChartLegend items={legendItems} />
      </div>
      {fillHeight ? null : (
        <div className="w-full">
          <ChartValues
            title="Spending by category"
            rows={slices.map((slice) => ({
              label: slice.name,
              values: [
                { value: formatAmount(slice.amount), color: slice.fill },
                {
                  name: "of total",
                  value: `${totalAmount > 0 ? Math.round((slice.amount / totalAmount) * 100) : 0}%`,
                },
              ],
            }))}
          />
        </div>
      )}
    </div>
  );
}
