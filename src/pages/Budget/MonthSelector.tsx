import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  month: string;
  onChange: (month: string) => void;
  className?: string;
};

export function formatMonth(month: string): string {
  const parts = month.split("-").map(Number);
  return new Date(parts[0]!, parts[1]! - 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function shiftMonth(month: string, delta: number): string {
  const parts = month.split("-").map(Number);
  const d = new Date(parts[0]!, parts[1]! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthSelector({ month, onChange, className }: Props) {
  return (
    <div
      role="group"
      aria-label="Budget month"
      className={cn(
        "flex items-center justify-between gap-2 md:justify-start",
        className,
      )}
    >
      <Button
        variant="outline"
        size="icon"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span
        aria-live="polite"
        className="min-w-0 flex-1 text-center text-sm font-medium md:min-w-[140px] md:flex-none"
      >
        {formatMonth(month)}
      </span>
      <Button
        variant="outline"
        size="icon"
        aria-label="Next month"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
