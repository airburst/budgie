import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";

export type ChartValueRow = {
  label: string;
  /** One or more `name: value` pairs, rendered as text so nothing is hover-only. */
  values: { name?: string; value: string; color?: string }[];
};

type Props = {
  /** Chart name, used for the disclosure's accessible label. */
  title: string;
  rows: ChartValueRow[];
};

/**
 * Tap/keyboard-accessible readout of the values a chart draws. Tooltips and
 * hover guides are a visual aid only; this disclosure carries the same numbers
 * as plain text.
 */
export function ChartValues({ title, rows }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="chart-values"
      className="mt-3 border-t pt-2"
    >
      <CollapsibleTrigger
        render={<Button variant="ghost" size="sm" />}
      >
        <ChevronDownIcon
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        />
        {open ? "Hide values" : "Show values"}
        <span className="sr-only"> for {title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul aria-label={`${title} values`} className="mt-2 grid gap-1 text-sm">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-md bg-muted/40 px-3 py-1.5"
            >
              <span className="min-w-0 font-medium break-words">
                {row.label}
              </span>
              <span className="flex flex-wrap justify-end gap-x-3 tabular-nums">
                {row.values.map((entry) => (
                  <span key={entry.name ?? entry.value}>
                    {entry.color && (
                      <span
                        aria-hidden
                        className="mr-1 inline-block size-2 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                    )}
                    {entry.name && (
                      <span className="text-muted-foreground">
                        {entry.name}{" "}
                      </span>
                    )}
                    {entry.value}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
