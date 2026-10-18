import { useEffect, useRef, useState } from "react";

export type ChartLegendItem = {
  label: string;
  color: string;
};

type Props = {
  items: ChartLegendItem[];
  /** Larger presentation used when the chart's card is maximised. */
  large?: boolean;
};

/**
 * HTML legend shared by the Reports charts so their text size, dot size and
 * spacing always match exactly, regardless of which chart mark draws them.
 */
export function ChartLegend({ items, large }: Props) {
  return (
    <ul
      aria-label="Chart legend"
      className={
        large
          ? "flex min-w-0 shrink-0 flex-wrap justify-center gap-x-4 gap-y-2 text-base"
          : "flex min-w-0 flex-wrap justify-center gap-x-4 gap-y-2 text-sm"
      }
    >
      {items.map((item) => (
        <li
          key={item.label}
          className="flex min-w-0 max-w-full items-start gap-2"
        >
          <span
            className="mt-1 size-3 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="min-w-0 [overflow-wrap:anywhere] text-foreground/85">
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Tracks an element's rendered height, used to reserve space for it in a fixed-height layout. */
export function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next =
        entry?.contentBoxSize?.[0]?.blockSize ?? entry?.contentRect.height;
      if (next !== undefined) setHeight(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
}
