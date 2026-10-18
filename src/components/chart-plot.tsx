import { RendererChart } from "@tanstack/charts/react/tooltip";
import type { ChartValue } from "@tanstack/charts";
import { useEffect, useRef, useState, type ComponentProps } from "react";

type Props<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
> = Omit<
  ComponentProps<typeof RendererChart<TDatum, TXValue, TYValue>>,
  "height" | "aspectRatio"
> & {
  aspectRatio?: number;
  maxHeight?: number;
  height?: number;
  square?: boolean;
};

export function ChartPlot<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>({
  aspectRatio = 1,
  maxHeight = 300,
  height,
  square = false,
  initialWidth = 300,
  ...props
}: Props<TDatum, TXValue, TYValue>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(initialWidth);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const plotHeight = height ?? Math.min(width / aspectRatio, maxHeight);
  return (
    <div ref={ref} className="w-full min-w-0 shrink-0" data-slot="chart-plot">
      <div
        className="mx-auto min-w-0"
        style={{
          height: plotHeight,
          width: square ? Math.min(width, plotHeight) : "100%",
        }}
      >
        <RendererChart
          {...props}
          initialWidth={initialWidth}
          height={plotHeight}
        />
      </div>
    </div>
  );
}
