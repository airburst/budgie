import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  month: string;
  onChange: (month: string) => void;
};

function formatMonth(month: string): string {
  const parts = month.split("-").map(Number);
  return new Date(parts[0]!, parts[1]! - 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(month: string, delta: number): string {
  const parts = month.split("-").map(Number);
  const d = new Date(parts[0]!, parts[1]! - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthSelector({ month, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[140px] text-center text-sm font-medium">
        {formatMonth(month)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
