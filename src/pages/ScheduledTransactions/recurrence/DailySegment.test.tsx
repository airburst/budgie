import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DailySegment } from "./DailySegment";

describe("DailySegment", () => {
  it("renders 'every' and 'Day(s)' labels", () => {
    render(<DailySegment interval={1} onChange={() => {}} />);
    expect(screen.getByText("every")).toBeTruthy();
    expect(screen.getByText("Day(s)")).toBeTruthy();
  });

  it("displays the interval prop value", () => {
    render(<DailySegment interval={3} onChange={() => {}} />);
    expect(screen.getByDisplayValue("3")).toBeTruthy();
  });

  it("input has type=number and min=1", () => {
    render(<DailySegment interval={1} onChange={() => {}} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toBeTruthy();
    expect((input as HTMLInputElement).min).toBe("1");
  });

  it("calls onChange with parsed int on input change", () => {
    const onChange = vi.fn();
    render(<DailySegment interval={1} onChange={onChange} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("does not call onChange for non-numeric input", () => {
    const onChange = vi.fn();
    render(<DailySegment interval={1} onChange={onChange} />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "" } });
    // Empty string → NaN → onChange not called
    expect(onChange).not.toHaveBeenCalled();
  });
});
