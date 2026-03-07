import { cn } from "@/lib/utils";
import type { WeekdayKey } from "./types";
import { WEEKDAY_DEFS } from "./types";

type WeeklySegmentProps = {
  selectedDays: WeekdayKey[];
  onChange: (selectedDays: WeekdayKey[]) => void;
};

export function WeeklySegment({ selectedDays, onChange }: WeeklySegmentProps) {
  function toggle(key: WeekdayKey) {
    if (selectedDays.includes(key)) {
      onChange(selectedDays.filter((d) => d !== key));
    } else {
      onChange([...selectedDays, key]);
    }
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {WEEKDAY_DEFS.map(({ key, label }) => {
        const checked = selectedDays.includes(key);
        return (
          <label
            key={key}
            className={cn(
              "flex h-9 w-11 cursor-pointer items-center justify-center rounded-md border text-xs font-medium transition-colors select-none",
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={() => toggle(key)}
              data-testid={`weekday-${key}`}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}
