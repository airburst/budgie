import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DailySegment } from "./DailySegment";
import { MonthlySegment } from "./MonthlySegment";
import type { OccurrenceType, RecurrenceConfig } from "./types";
import { MONTHLY_OCCURRENCE_OPTIONS, WEEKLY_OCCURRENCE_OPTIONS } from "./types";
import { WeeklySegment } from "./WeeklySegment";

type RecurrenceSectionProps = {
  config: RecurrenceConfig;
  onChange: (config: RecurrenceConfig) => void;
};

export function RecurrenceSection({
  config,
  onChange,
}: RecurrenceSectionProps) {
  function set(partial: Partial<RecurrenceConfig>) {
    onChange({ ...config, ...partial });
  }

  const showOccurrence =
    config.frequency === "Weekly" || config.frequency === "Monthly";

  const occurrenceOptions: OccurrenceType[] =
    config.frequency === "Weekly"
      ? WEEKLY_OCCURRENCE_OPTIONS
      : config.frequency === "Monthly"
        ? MONTHLY_OCCURRENCE_OPTIONS
        : [];

  const segment =
    config.frequency === "Daily" ? (
      <DailySegment
        interval={config.interval}
        onChange={(interval) => set({ interval })}
      />
    ) : config.frequency === "Weekly" ? (
      <WeeklySegment
        selectedDays={config.selectedDays}
        onChange={(selectedDays) => set({ selectedDays })}
      />
    ) : config.frequency === "Monthly" ? (
      <MonthlySegment
        monthDays={config.monthDays}
        onChange={(monthDays) => set({ monthDays })}
      />
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      {showOccurrence ? (
        <div className="grid grid-cols-[1fr_3fr] gap-3 items-start">
          <div className="flex flex-col gap-1.5">
            <Label>Occurrence</Label>
            <Select
              value={config.occurrence}
              onValueChange={(v) => set({ occurrence: v as OccurrenceType })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {occurrenceOptions.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="invisible select-none">Days</Label>
            <div className="flex items-start">{segment}</div>
          </div>
        </div>
      ) : (
        segment && <div>{segment}</div>
      )}

      {config.frequency !== "Once" && (
        <div className="flex flex-col gap-2">
          <Label>End Condition</Label>
          <div className="flex gap-2">
            {(
              [
                ["never", "Never"],
                ["on_date", "On date"],
                ["after_x", "After X times"],
              ] as [RecurrenceConfig["endCondition"], string][]
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => set({ endCondition: val })}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  config.endCondition === val
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {config.endCondition === "on_date" && (
            <Input
              type="date"
              value={config.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
            />
          )}
          {config.endCondition === "after_x" && (
            <Input
              type="number"
              min="1"
              placeholder="Number of payments"
              value={config.endCount}
              onChange={(e) => set({ endCount: e.target.value })}
            />
          )}
        </div>
      )}
    </div>
  );
}
