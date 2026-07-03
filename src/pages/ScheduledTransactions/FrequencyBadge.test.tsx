import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FrequencyBadge } from "./FrequencyBadge";

describe("FrequencyBadge", () => {
  it("shows 'Once' for a one-off rule (DAILY + COUNT=1)", () => {
    render(<FrequencyBadge rruleStr="FREQ=DAILY;COUNT=1" />);
    expect(screen.getByText("Once")).toBeTruthy();
  });

  it("shows 'Daily' for a recurring daily rule", () => {
    render(<FrequencyBadge rruleStr="FREQ=DAILY" />);
    expect(screen.getByText("Daily")).toBeTruthy();
  });

  it("shows 'Weekly' for a weekly rule", () => {
    render(<FrequencyBadge rruleStr="FREQ=WEEKLY;BYDAY=WE" />);
    expect(screen.getByText("Weekly")).toBeTruthy();
  });

  it("shows 'Monthly' for a monthly rule", () => {
    render(<FrequencyBadge rruleStr="FREQ=MONTHLY;BYMONTHDAY=1" />);
    expect(screen.getByText("Monthly")).toBeTruthy();
  });
});
