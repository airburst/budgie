import { describe, expect, it } from "vitest";
import { buildRRule } from "./buildRRule";
import { parseRRule } from "./parseRRule";
import type { RecurrenceConfig } from "./types";
import { DEFAULT_RECURRENCE_CONFIG } from "./types";

function cfg(partial: Partial<RecurrenceConfig>): RecurrenceConfig {
  return { ...DEFAULT_RECURRENCE_CONFIG, ...partial };
}

describe("buildRRule", () => {
  describe("Once", () => {
    it("produces FREQ=DAILY;COUNT=1", () => {
      expect(buildRRule(cfg({ frequency: "Once" }))).toBe("FREQ=DAILY;COUNT=1");
    });

    it("ignores end conditions", () => {
      expect(
        buildRRule(cfg({ frequency: "Once", endCondition: "after_x", endCount: "5" })),
      ).toBe("FREQ=DAILY;COUNT=1");
    });
  });

  describe("Daily", () => {
    it("interval=1 → FREQ=DAILY (no INTERVAL)", () => {
      expect(buildRRule(cfg({ frequency: "Daily", interval: 1 }))).toBe("FREQ=DAILY");
    });

    it("interval=3 → FREQ=DAILY;INTERVAL=3", () => {
      expect(buildRRule(cfg({ frequency: "Daily", interval: 3 }))).toBe("FREQ=DAILY;INTERVAL=3");
    });

    it("interval=7 → FREQ=DAILY;INTERVAL=7", () => {
      expect(buildRRule(cfg({ frequency: "Daily", interval: 7 }))).toBe("FREQ=DAILY;INTERVAL=7");
    });
  });

  describe("Weekly / Every", () => {
    it("no days → FREQ=WEEKLY", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Every", selectedDays: [] }))).toBe("FREQ=WEEKLY");
    });

    it("[MO] → FREQ=WEEKLY;BYDAY=MO", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Every", selectedDays: ["MO"] }))).toBe("FREQ=WEEKLY;BYDAY=MO");
    });

    it("[MO,WE,FR] → FREQ=WEEKLY;BYDAY=MO,WE,FR", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Every", selectedDays: ["MO", "WE", "FR"] }))).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    });

    it("[SU,SA] → FREQ=WEEKLY;BYDAY=SU,SA", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Every", selectedDays: ["SU", "SA"] }))).toBe("FREQ=WEEKLY;BYDAY=SU,SA");
    });
  });

  describe("Weekly / positional", () => {
    it("First [MO] → FREQ=MONTHLY;BYDAY=+1MO", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "First", selectedDays: ["MO"] }))).toBe("FREQ=MONTHLY;BYDAY=+1MO");
    });

    it("Second [MO,TU] → FREQ=MONTHLY;BYDAY=+2MO,+2TU", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Second", selectedDays: ["MO", "TU"] }))).toBe("FREQ=MONTHLY;BYDAY=+2MO,+2TU");
    });

    it("Third [WE] → FREQ=MONTHLY;BYDAY=+3WE", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Third", selectedDays: ["WE"] }))).toBe("FREQ=MONTHLY;BYDAY=+3WE");
    });

    it("Fourth [TH] → FREQ=MONTHLY;BYDAY=+4TH", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Fourth", selectedDays: ["TH"] }))).toBe("FREQ=MONTHLY;BYDAY=+4TH");
    });

    it("Fifth [MO] → FREQ=MONTHLY;BYDAY=+5MO", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Fifth", selectedDays: ["MO"] }))).toBe("FREQ=MONTHLY;BYDAY=+5MO");
    });

    it("Last [FR] → FREQ=MONTHLY;BYDAY=-1FR", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Last", selectedDays: ["FR"] }))).toBe("FREQ=MONTHLY;BYDAY=-1FR");
    });

    it("Last [SU,SA] → FREQ=MONTHLY;BYDAY=-1SU,-1SA", () => {
      expect(buildRRule(cfg({ frequency: "Weekly", occurrence: "Last", selectedDays: ["SU", "SA"] }))).toBe("FREQ=MONTHLY;BYDAY=-1SU,-1SA");
    });
  });

  describe("Monthly", () => {
    it("Every, no days → FREQ=MONTHLY", () => {
      expect(buildRRule(cfg({ frequency: "Monthly", occurrence: "Every", monthDays: [] }))).toBe("FREQ=MONTHLY");
    });

    it("Every [1,15,-1] → FREQ=MONTHLY;BYMONTHDAY=1,15,-1", () => {
      expect(buildRRule(cfg({ frequency: "Monthly", occurrence: "Every", monthDays: [1, 15, -1] }))).toBe("FREQ=MONTHLY;BYMONTHDAY=1,15,-1");
    });

    it("Every Other [1] → FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1", () => {
      expect(buildRRule(cfg({ frequency: "Monthly", occurrence: "Every Other", monthDays: [1] }))).toBe("FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=1");
    });

    it("Third [15] → FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15", () => {
      expect(buildRRule(cfg({ frequency: "Monthly", occurrence: "Third", monthDays: [15] }))).toBe("FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=15");
    });

    it("Fourth [1] → FREQ=MONTHLY;INTERVAL=4;BYMONTHDAY=1", () => {
      expect(buildRRule(cfg({ frequency: "Monthly", occurrence: "Fourth", monthDays: [1] }))).toBe("FREQ=MONTHLY;INTERVAL=4;BYMONTHDAY=1");
    });

    it("Sixth [1] → FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=1", () => {
      expect(buildRRule(cfg({ frequency: "Monthly", occurrence: "Sixth", monthDays: [1] }))).toBe("FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=1");
    });
  });

  describe("Annually", () => {
    it("produces FREQ=YEARLY", () => {
      expect(buildRRule(cfg({ frequency: "Annually" }))).toBe("FREQ=YEARLY");
    });
  });

  describe("End conditions", () => {
    it("Daily with on_date → appends UNTIL", () => {
      expect(
        buildRRule(cfg({ frequency: "Daily", interval: 1, endCondition: "on_date", endDate: "2024-12-31" })),
      ).toBe("FREQ=DAILY;UNTIL=20241231T000000Z");
    });

    it("Monthly with after_x → appends COUNT", () => {
      expect(
        buildRRule(cfg({ frequency: "Monthly", occurrence: "Every", monthDays: [1], endCondition: "after_x", endCount: "3" })),
      ).toBe("FREQ=MONTHLY;BYMONTHDAY=1;COUNT=3");
    });

    it("Weekly with after_x → appends COUNT", () => {
      expect(
        buildRRule(cfg({ frequency: "Weekly", occurrence: "Every", selectedDays: ["MO"], endCondition: "after_x", endCount: "12" })),
      ).toBe("FREQ=WEEKLY;BYDAY=MO;COUNT=12");
    });

    it("Annually with on_date → appends UNTIL", () => {
      expect(
        buildRRule(cfg({ frequency: "Annually", endCondition: "on_date", endDate: "2030-01-01" })),
      ).toBe("FREQ=YEARLY;UNTIL=20300101T000000Z");
    });

    it("never end condition → no UNTIL or COUNT", () => {
      expect(
        buildRRule(cfg({ frequency: "Daily", interval: 1, endCondition: "never" })),
      ).toBe("FREQ=DAILY");
    });

    it("on_date with empty endDate → no UNTIL appended", () => {
      expect(
        buildRRule(cfg({ frequency: "Daily", interval: 1, endCondition: "on_date", endDate: "" })),
      ).toBe("FREQ=DAILY");
    });

    it("after_x with empty endCount → no COUNT appended", () => {
      expect(
        buildRRule(cfg({ frequency: "Daily", interval: 1, endCondition: "after_x", endCount: "" })),
      ).toBe("FREQ=DAILY");
    });
  });
});

describe("parseRRule", () => {
  describe("legacy strings", () => {
    it("FREQ=MONTHLY → Monthly/Every, empty monthDays", () => {
      const r = parseRRule("FREQ=MONTHLY");
      expect(r.frequency).toBe("Monthly");
      expect(r.occurrence).toBe("Every");
      expect(r.monthDays).toEqual([]);
    });

    it("FREQ=DAILY → Daily, interval=1", () => {
      const r = parseRRule("FREQ=DAILY");
      expect(r.frequency).toBe("Daily");
      expect(r.interval).toBe(1);
    });

    it("FREQ=WEEKLY → Weekly/Every, no selectedDays", () => {
      const r = parseRRule("FREQ=WEEKLY");
      expect(r.frequency).toBe("Weekly");
      expect(r.occurrence).toBe("Every");
      expect(r.selectedDays).toEqual([]);
    });

    it("FREQ=YEARLY → Annually", () => {
      expect(parseRRule("FREQ=YEARLY").frequency).toBe("Annually");
    });

    it("FREQ=WEEKLY;UNTIL=20241231T000000Z → on_date end", () => {
      const r = parseRRule("FREQ=WEEKLY;UNTIL=20241231T000000Z");
      expect(r.frequency).toBe("Weekly");
      expect(r.endCondition).toBe("on_date");
      expect(r.endDate).toBe("2024-12-31");
    });

    it("garbage string → returns default config", () => {
      const r = parseRRule("not-a-valid-rrule");
      expect(r.frequency).toBe("Monthly");
    });
  });

  describe("round-trips", () => {
    function roundTrip(partial: Partial<RecurrenceConfig>): RecurrenceConfig {
      return parseRRule(buildRRule(cfg(partial)));
    }

    it("Once", () => {
      expect(roundTrip({ frequency: "Once" }).frequency).toBe("Once");
    });

    it("Daily interval=1", () => {
      const r = roundTrip({ frequency: "Daily", interval: 1 });
      expect(r.frequency).toBe("Daily");
      expect(r.interval).toBe(1);
    });

    it("Daily interval=5", () => {
      const r = roundTrip({ frequency: "Daily", interval: 5 });
      expect(r.frequency).toBe("Daily");
      expect(r.interval).toBe(5);
    });

    it("Weekly/Every [MO,WE]", () => {
      const r = roundTrip({ frequency: "Weekly", occurrence: "Every", selectedDays: ["MO", "WE"] });
      expect(r.frequency).toBe("Weekly");
      expect(r.occurrence).toBe("Every");
      expect(r.selectedDays).toEqual(["MO", "WE"]);
    });

    it("Weekly/First [MO]", () => {
      const r = roundTrip({ frequency: "Weekly", occurrence: "First", selectedDays: ["MO"] });
      expect(r.frequency).toBe("Weekly");
      expect(r.occurrence).toBe("First");
      expect(r.selectedDays).toEqual(["MO"]);
    });

    it("Weekly/Second [TU,TH]", () => {
      const r = roundTrip({ frequency: "Weekly", occurrence: "Second", selectedDays: ["TU", "TH"] });
      expect(r.frequency).toBe("Weekly");
      expect(r.occurrence).toBe("Second");
      expect(r.selectedDays).toEqual(["TU", "TH"]);
    });

    it("Weekly/Last [FR]", () => {
      const r = roundTrip({ frequency: "Weekly", occurrence: "Last", selectedDays: ["FR"] });
      expect(r.frequency).toBe("Weekly");
      expect(r.occurrence).toBe("Last");
      expect(r.selectedDays).toEqual(["FR"]);
    });

    it("Weekly/Last [SU,SA]", () => {
      const r = roundTrip({ frequency: "Weekly", occurrence: "Last", selectedDays: ["SU", "SA"] });
      expect(r.frequency).toBe("Weekly");
      expect(r.occurrence).toBe("Last");
      expect(r.selectedDays).toEqual(["SU", "SA"]);
    });

    it("Monthly/Every [1,15,-1]", () => {
      const r = roundTrip({ frequency: "Monthly", occurrence: "Every", monthDays: [1, 15, -1] });
      expect(r.frequency).toBe("Monthly");
      expect(r.occurrence).toBe("Every");
      expect(r.monthDays).toEqual([1, 15, -1]);
    });

    it("Monthly/Every Other [1]", () => {
      const r = roundTrip({ frequency: "Monthly", occurrence: "Every Other", monthDays: [1] });
      expect(r.frequency).toBe("Monthly");
      expect(r.occurrence).toBe("Every Other");
    });

    it("Monthly/Third [15]", () => {
      const r = roundTrip({ frequency: "Monthly", occurrence: "Third", monthDays: [15] });
      expect(r.frequency).toBe("Monthly");
      expect(r.occurrence).toBe("Third");
    });

    it("Monthly/Sixth [1]", () => {
      const r = roundTrip({ frequency: "Monthly", occurrence: "Sixth", monthDays: [1] });
      expect(r.frequency).toBe("Monthly");
      expect(r.occurrence).toBe("Sixth");
    });

    it("Annually", () => {
      expect(roundTrip({ frequency: "Annually" }).frequency).toBe("Annually");
    });

    it("with on_date end condition", () => {
      const r = roundTrip({ frequency: "Daily", interval: 1, endCondition: "on_date", endDate: "2024-12-31" });
      expect(r.endCondition).toBe("on_date");
      expect(r.endDate).toBe("2024-12-31");
    });

    it("with after_x end condition", () => {
      const r = roundTrip({ frequency: "Weekly", occurrence: "Every", selectedDays: ["MO"], endCondition: "after_x", endCount: "6" });
      expect(r.endCondition).toBe("after_x");
      expect(r.endCount).toBe("6");
    });
  });
});
