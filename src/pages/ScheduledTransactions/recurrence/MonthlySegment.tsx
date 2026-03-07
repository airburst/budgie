import { cn } from "@/lib/utils";

type MonthlySegmentProps = {
  monthDays: number[];
  onChange: (monthDays: number[]) => void;
};

const ALL_MONTH_DAYS: { value: number; label: string }[] = [
  ...Array.from({ length: 31 }, (_, i) => ({
    value: i + 1,
    label: String(i + 1),
  })),
  { value: -1, label: "Last" },
];

export function MonthlySegment({ monthDays, onChange }: MonthlySegmentProps) {
  function toggle(value: number) {
    if (monthDays.includes(value)) {
      onChange(monthDays.filter((d) => d !== value));
    } else {
      onChange([...monthDays, value]);
    }
  }

  return (
    <div className="grid grid-cols-8 gap-1">
      {ALL_MONTH_DAYS.map(({ value, label }) => {
        const checked = monthDays.includes(value);
        return (
          <label
            key={value}
            className={cn(
              "flex h-8 cursor-pointer items-center justify-center rounded-md border text-xs font-medium transition-colors select-none",
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted",
              value === -1 && "col-span-1",
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={() => toggle(value)}
              data-testid={`monthday-${value}`}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}
