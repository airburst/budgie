import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

export type ChartPoint = {
  date: string;
  balance: number;
};

const chartConfig = {
  balance: {
    label: "Balance",
    color: "#22c55e",
  },
} satisfies ChartConfig;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const formatCurrencyFull = (value: number) =>
  value.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

type CursorProps = {
  points?: { x: number; y: number }[];
  height?: number;
  width?: number;
  payload?: { value: number; payload: ChartPoint }[];
};

function TrackingCursor({ points, height, width, payload }: CursorProps) {
  if (!points?.length || height == null || width == null) return null;
  const point = points[0];
  if (!point) return null;
  const { x, y } = point;
  const value = payload?.[0]?.value;
  const date = payload?.[0]?.payload?.date;

  // Flip label below the dot if there isn't room above it
  const labelAbove = y > 36;
  const valueY = labelAbove ? y - 8 : y + 16;
  const dateY = labelAbove ? y - 20 : y + 26;

  // Keep horizontal label inside the chart area (approx 90px wide)
  const labelX = x + 8 + 90 > width ? x - 8 : x + 8;
  const anchor = x + 8 + 90 > width ? "end" : "start";

  const dateLabel = date
    ? (() => {
        const [yr, m, d] = date.split("-");
        return format(new Date(Number(yr), Number(m) - 1, Number(d)), "d MMM");
      })()
    : null;

  return (
    <g>
      {/* Full-height dashed cursor line */}
      <line
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        style={{ stroke: "var(--muted-foreground)" }}
        strokeWidth={1}
        strokeDasharray="4 4"
        strokeOpacity={0.6}
      />
      {/* Solid line from chart floor to data point */}
      <line
        x1={x}
        y1={height}
        x2={x}
        y2={y}
        stroke="var(--color-balance)"
        strokeWidth={2}
        strokeOpacity={0.35}
      />
      {/* Active dot */}
      <circle cx={x} cy={y} r={3.5} fill="var(--color-balance)" />
      {/* Value + date labels above (or below) the dot */}
      {value !== undefined && (
        <>
          <text
            x={labelX}
            y={valueY}
            textAnchor={anchor}
            style={{ fill: "var(--foreground)" }}
            fontSize={11}
            fontWeight={600}
          >
            {formatCurrencyFull(value)}
          </text>
          {dateLabel && (
            <text
              x={labelX}
              y={dateY}
              textAnchor={anchor}
              style={{ fill: "var(--muted-foreground)" }}
              fontSize={10}
            >
              {dateLabel}
            </text>
          )}
        </>
      )}
    </g>
  );
}

// Stable module-level references prevent recharts 3's Redux store from
// detecting a "change" on every render and spinning into an infinite loop.
const noTooltipContent = () => null;
const trackingCursor = <TrackingCursor />;
const xTickFormatter = (value: string) => {
  const [y, m, d] = value.split("-");
  return format(new Date(Number(y), Number(m) - 1, Number(d)), "dd MMM");
};

type Props = {
  chartData: ChartPoint[];
};

export function ForecastChart({ chartData }: Props) {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <LineChart
        data={chartData}
        margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
        accessibilityLayer={false}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={xTickFormatter}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={64}
          tickFormatter={formatCurrency}
        />
        <ChartTooltip
          cursor={trackingCursor}
          content={noTooltipContent}
          isAnimationActive={false}
        />
        <ReferenceLine
          y={0}
          stroke="#ef4444"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
        <Line
          dataKey="balance"
          type="linear"
          stroke="var(--color-balance)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
