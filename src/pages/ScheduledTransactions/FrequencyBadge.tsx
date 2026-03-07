import { Badge } from "@/components/ui/badge";
import { memo } from "react";
import { RRule } from "rrule";

const FREQ_LABELS: Record<number, string> = {
  [RRule.DAILY]: "Daily",
  [RRule.WEEKLY]: "Weekly",
  [RRule.MONTHLY]: "Monthly",
  [RRule.YEARLY]: "Yearly",
};

type FrequencyBadgeProps = {
  rruleStr: string;
};

export const FrequencyBadge = memo(function FrequencyBadge({ rruleStr }: FrequencyBadgeProps) {
  try {
    const rule = RRule.fromString(rruleStr);
    const label = FREQ_LABELS[rule.options.freq] ?? rruleStr;
    return <Badge variant="secondary">{label}</Badge>;
  } catch {
    return <Badge variant="outline">{rruleStr}</Badge>;
  }
});
