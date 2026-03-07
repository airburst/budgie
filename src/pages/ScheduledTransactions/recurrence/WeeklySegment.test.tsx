import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WeeklySegment } from "./WeeklySegment";

describe("WeeklySegment", () => {
  it("renders 7 day checkboxes", () => {
    render(<WeeklySegment selectedDays={[]} onChange={() => {}} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
  });

  it("renders all weekday labels", () => {
    render(<WeeklySegment selectedDays={[]} onChange={() => {}} />);
    for (const label of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("checked state matches selectedDays prop", () => {
    render(<WeeklySegment selectedDays={["MO", "FR"]} onChange={() => {}} />);
    expect(screen.getByTestId<HTMLInputElement>("weekday-MO").checked).toBe(
      true,
    );
    expect(screen.getByTestId<HTMLInputElement>("weekday-FR").checked).toBe(
      true,
    );
    expect(screen.getByTestId<HTMLInputElement>("weekday-SU").checked).toBe(
      false,
    );
    expect(screen.getByTestId<HTMLInputElement>("weekday-WE").checked).toBe(
      false,
    );
  });

  it("clicking unchecked day calls onChange with day added", async () => {
    const onChange = vi.fn();
    render(<WeeklySegment selectedDays={["MO"]} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("weekday-WE").closest("label")!);
    expect(onChange).toHaveBeenCalledWith(["MO", "WE"]);
  });

  it("clicking checked day calls onChange with day removed", async () => {
    const onChange = vi.fn();
    render(<WeeklySegment selectedDays={["MO", "WE"]} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("weekday-MO").closest("label")!);
    expect(onChange).toHaveBeenCalledWith(["WE"]);
  });

  it("toggling all days off results in empty array", async () => {
    const onChange = vi.fn();
    render(<WeeklySegment selectedDays={["TU"]} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("weekday-TU").closest("label")!);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
