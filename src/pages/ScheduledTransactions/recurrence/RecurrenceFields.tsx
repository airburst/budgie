import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecurrenceSection } from "./RecurrenceSection";
import type { FrequencyType, RecurrenceConfig } from "./types";
import { FREQUENCY_OPTIONS } from "./types";

type RecurrenceFieldsProps = {
  startDate: string;
  recurrence: RecurrenceConfig;
  onStartDateChange: (v: string) => void;
  onFrequencyChange: (freq: FrequencyType) => void;
  onRecurrenceChange: (recurrence: RecurrenceConfig) => void;
};

export function RecurrenceFields({
  startDate,
  recurrence,
  onStartDateChange,
  onFrequencyChange,
  onRecurrenceChange,
}: RecurrenceFieldsProps) {
  return (
    <div className="border-t border-border pt-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Recurrence Rules
      </p>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sp-start">First Payment Date</Label>
            <DatePicker
              value={startDate}
              onChange={onStartDateChange}
              disabled={{ before: new Date() }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Frequency</Label>
            <Select
              value={recurrence.frequency}
              onValueChange={(v) => onFrequencyChange(v as FrequencyType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <RecurrenceSection config={recurrence} onChange={onRecurrenceChange} />
      </div>
    </div>
  );
}
