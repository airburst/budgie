import { Input } from "@/components/ui/input";

type DailySegmentProps = {
  interval: number;
  onChange: (interval: number) => void;
};

export function DailySegment({ interval, onChange }: DailySegmentProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">every</span>
      <Input
        type="number"
        min={1}
        step={1}
        className="w-20"
        value={interval}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= 1) onChange(v);
        }}
      />
      <span className="text-sm text-muted-foreground">Day(s)</span>
    </div>
  );
}
