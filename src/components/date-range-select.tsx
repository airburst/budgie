import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DateRange = {
  startDate: string;
  endDate: string;
  preset: string;
};

const PRESETS = [
  { value: "30", label: "Last 30 Days" },
  { value: "60", label: "Last 60 Days" },
  { value: "90", label: "Last 90 Days" },
  { value: "this-month", label: "This Month" },
  { value: "last-month", label: "Last Month" },
  { value: "this-year", label: "This Year" },
];

function computeRange(preset: string): DateRange {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  switch (preset) {
    case "this-month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: fmt(start), endDate: fmt(now), preset };
    }
    case "last-month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: fmt(start), endDate: fmt(end), preset };
    }
    case "this-year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: fmt(start), endDate: fmt(now), preset };
    }
    default: {
      const days = parseInt(preset, 10) || 30;
      const start = new Date(now);
      start.setDate(start.getDate() - days);
      return { startDate: fmt(start), endDate: fmt(now), preset };
    }
  }
}

type Props = {
  value: string;
  onChange: (range: DateRange) => void;
};

export function DateRangeSelect({ value, onChange }: Props) {
  return (
    <Select
      value={value}
      onValueChange={(val) => val && onChange(computeRange(val))}
    >
      <SelectTrigger size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRESETS.map((p) => (
          <SelectItem key={p.value} value={p.value}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { computeRange };
