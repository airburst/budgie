import type { Options } from "rrule";
import { Frequency, RRule } from "rrule";
import type {
  MonthlyOccurrence,
  RecurrenceConfig,
  WeekdayKey,
  WeeklyOccurrence,
} from "./types";

const RRULE_WEEKDAYS: Record<WeekdayKey, (typeof RRule)[WeekdayKey]> = {
  SU: RRule.SU,
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
};

const WEEKLY_OCCURRENCE_N: Record<WeeklyOccurrence, number> = {
  Every: 1, // unused via this path
  First: 1,
  Second: 2,
  Third: 3,
  Fourth: 4,
  Fifth: 5,
  Last: -1,
};

const MONTHLY_OCCURRENCE_INTERVAL: Record<MonthlyOccurrence, number> = {
  Every: 1,
  "Every Other": 2,
  Third: 3,
  Fourth: 4,
  Sixth: 6,
};

export function buildRRule(config: RecurrenceConfig): string {
  const {
    frequency,
    occurrence,
    interval,
    selectedDays,
    monthDays,
    endCondition,
    endDate,
    endCount,
  } = config;

  const opts: Partial<Options> = {};

  switch (frequency) {
    case "Once":
      opts.freq = Frequency.DAILY;
      opts.count = 1;
      break;

    case "Daily":
      opts.freq = Frequency.DAILY;
      if (interval > 1) opts.interval = interval;
      break;

    case "Weekly":
      if (occurrence === "Every") {
        opts.freq = Frequency.WEEKLY;
        if (selectedDays.length > 0) {
          opts.byweekday = selectedDays.map((d) => RRULE_WEEKDAYS[d]);
        }
      } else {
        const n = WEEKLY_OCCURRENCE_N[occurrence as WeeklyOccurrence];
        opts.freq = Frequency.MONTHLY;
        if (selectedDays.length > 0) {
          opts.byweekday = selectedDays.map((d) => RRULE_WEEKDAYS[d].nth(n));
        }
      }
      break;

    case "Monthly": {
      const iv =
        MONTHLY_OCCURRENCE_INTERVAL[occurrence as MonthlyOccurrence] ?? 1;
      opts.freq = Frequency.MONTHLY;
      if (iv > 1) opts.interval = iv;
      if (monthDays.length > 0) opts.bymonthday = monthDays;
      break;
    }

    case "Annually":
      opts.freq = Frequency.YEARLY;
      break;
  }

  // Attach end condition — Once already has COUNT=1 so skip
  if (frequency !== "Once") {
    if (endCondition === "on_date" && endDate) {
      opts.until = new Date(endDate + "T00:00:00Z");
    } else if (endCondition === "after_x" && endCount) {
      const c = parseInt(endCount, 10);
      if (!isNaN(c) && c > 0) opts.count = c;
    }
  }

  const raw = RRule.optionsToString(opts);
  return raw.startsWith("RRULE:") ? raw.slice(6) : raw;
}

export function computeNextDueDate(
  rruleStr: string,
  startDate?: string,
): string | null {
  try {
    const dtstart = startDate ? new Date(startDate + "T12:00:00Z") : new Date();
    const rule = new RRule({ ...RRule.parseString(rruleStr), dtstart });
    const next = rule.after(dtstart, true);
    return next ? next.toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
}

export function computeNextOccurrenceAfter(
  rruleStr: string,
  fromDate: string,
): string | null {
  try {
    const dtstart = new Date(fromDate + "T12:00:00Z");
    const rule = new RRule({ ...RRule.parseString(rruleStr), dtstart });
    const next = rule.after(dtstart, false);
    return next ? next.toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
}
