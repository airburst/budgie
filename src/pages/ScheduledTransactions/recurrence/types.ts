export type WeekdayKey = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

export type FrequencyType =
  | "Once"
  | "Daily"
  | "Weekly"
  | "Monthly"
  | "Annually";

export type WeeklyOccurrence =
  | "Every"
  | "First"
  | "Second"
  | "Third"
  | "Fourth"
  | "Fifth"
  | "Last";

export type MonthlyOccurrence =
  | "Every"
  | "Every Other"
  | "Third"
  | "Fourth"
  | "Sixth";

export type OccurrenceType = WeeklyOccurrence | MonthlyOccurrence;

export type EndCondition = "never" | "on_date" | "after_x";

export type RecurrenceConfig = {
  frequency: FrequencyType;
  occurrence: OccurrenceType;
  interval: number;
  selectedDays: WeekdayKey[];
  monthDays: number[];
  endCondition: EndCondition;
  endDate: string;
  endCount: string;
};

export const DEFAULT_RECURRENCE_CONFIG: RecurrenceConfig = {
  frequency: "Monthly",
  occurrence: "Every",
  interval: 1,
  selectedDays: [],
  monthDays: [],
  endCondition: "never",
  endDate: "",
  endCount: "",
};

export const FREQUENCY_OPTIONS: FrequencyType[] = [
  "Once",
  "Daily",
  "Weekly",
  "Monthly",
  "Annually",
];

export const WEEKLY_OCCURRENCE_OPTIONS: WeeklyOccurrence[] = [
  "Every",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Last",
];

export const MONTHLY_OCCURRENCE_OPTIONS: MonthlyOccurrence[] = [
  "Every",
  "Every Other",
  "Third",
  "Fourth",
  "Sixth",
];

export const WEEKDAY_DEFS: { key: WeekdayKey; label: string }[] = [
  { key: "SU", label: "Sun" },
  { key: "MO", label: "Mon" },
  { key: "TU", label: "Tue" },
  { key: "WE", label: "Wed" },
  { key: "TH", label: "Thu" },
  { key: "FR", label: "Fri" },
  { key: "SA", label: "Sat" },
];
