import { Frequency, RRule } from "rrule";
import type {
  EndCondition,
  MonthlyOccurrence,
  RecurrenceConfig,
  WeekdayKey,
  WeeklyOccurrence,
} from "./types";
import { DEFAULT_RECURRENCE_CONFIG } from "./types";

// RRule weekday numbering: MO=0, TU=1, WE=2, TH=3, FR=4, SA=5, SU=6
const WEEKDAY_NUM_TO_KEY: Record<number, WeekdayKey> = {
  0: "MO",
  1: "TU",
  2: "WE",
  3: "TH",
  4: "FR",
  5: "SA",
  6: "SU",
};

const N_TO_WEEKLY_OCCURRENCE: Record<number, WeeklyOccurrence> = {
  1: "First",
  2: "Second",
  3: "Third",
  4: "Fourth",
  5: "Fifth",
  [-1]: "Last",
};

const INTERVAL_TO_MONTHLY_OCCURRENCE: Record<number, MonthlyOccurrence> = {
  1: "Every",
  2: "Every Other",
  3: "Third",
  4: "Fourth",
  6: "Sixth",
};

type RawWeekday = { weekday: number; n?: number };

function toWeekdayKey(wd: RawWeekday): WeekdayKey {
  return WEEKDAY_NUM_TO_KEY[wd.weekday] ?? "MO";
}

export function parseRRule(rruleStr: string): RecurrenceConfig {
  const result: RecurrenceConfig = { ...DEFAULT_RECURRENCE_CONFIG };

  try {
    const opts = RRule.parseString(rruleStr);

    // End condition
    const until = opts.until;
    if (until) {
      result.endCondition = "on_date" as EndCondition;
      const untilStr =
        typeof until === "string" ? until : (until as Date).toISOString();
      result.endDate = untilStr.slice(0, 10);
    } else if (opts.count != null && opts.count !== 1) {
      result.endCondition = "after_x" as EndCondition;
      result.endCount = String(opts.count);
    }

    const freq = opts.freq;

    if (freq === Frequency.DAILY) {
      if (opts.count === 1) {
        result.frequency = "Once";
        result.endCondition = "never";
      } else {
        result.frequency = "Daily";
        result.interval = opts.interval ?? 1;
      }
    } else if (freq === Frequency.WEEKLY) {
      result.frequency = "Weekly";
      result.occurrence = "Every";
      const wds = opts.byweekday;
      if (Array.isArray(wds)) {
        result.selectedDays = (wds as unknown as RawWeekday[]).map(
          toWeekdayKey,
        );
      }
    } else if (freq === Frequency.MONTHLY) {
      const wds = opts.byweekday;
      const wdArr = Array.isArray(wds)
        ? (wds as unknown as RawWeekday[])
        : wds != null
          ? [wds as unknown as RawWeekday]
          : [];

      const firstWd = wdArr[0];
      const isPositional =
        firstWd != null && firstWd.n != null && firstWd.n !== 0;

      if (isPositional) {
        result.frequency = "Weekly";
        const n = firstWd.n as number;
        result.occurrence = N_TO_WEEKLY_OCCURRENCE[n] ?? "First";
        result.selectedDays = wdArr.map(toWeekdayKey);
      } else {
        result.frequency = "Monthly";
        const iv = opts.interval ?? 1;
        result.occurrence = INTERVAL_TO_MONTHLY_OCCURRENCE[iv] ?? "Every";
        const bmd = opts.bymonthday;
        if (Array.isArray(bmd)) {
          result.monthDays = bmd as number[];
        } else if (bmd != null) {
          result.monthDays = [bmd as number];
        }
      }
    } else if (freq === Frequency.YEARLY) {
      result.frequency = "Annually";
    }
  } catch {
    return { ...DEFAULT_RECURRENCE_CONFIG };
  }

  return result;
}
