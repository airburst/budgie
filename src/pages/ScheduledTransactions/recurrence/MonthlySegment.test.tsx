import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MonthlySegment } from "./MonthlySegment";

describe("MonthlySegment", () => {
  it("renders 32 checkboxes (1–31 + Last)", () => {
    render(<MonthlySegment monthDays={[]} onChange={() => {}} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(32);
  });

  it("renders 'Last' label", () => {
    render(<MonthlySegment monthDays={[]} onChange={() => {}} />);
    expect(screen.getByText("Last")).toBeTruthy();
  });

  it("day 1 is checked when monthDays=[1]", () => {
    render(<MonthlySegment monthDays={[1]} onChange={() => {}} />);
    expect(screen.getByTestId<HTMLInputElement>("monthday-1").checked).toBe(
      true,
    );
    expect(screen.getByTestId<HTMLInputElement>("monthday-2").checked).toBe(
      false,
    );
  });

  it("Last checkbox is checked when monthDays=[-1]", () => {
    render(<MonthlySegment monthDays={[-1]} onChange={() => {}} />);
    expect(screen.getByTestId<HTMLInputElement>("monthday--1").checked).toBe(
      true,
    );
  });

  it("multiple days checked correctly", () => {
    render(<MonthlySegment monthDays={[1, 15, 31]} onChange={() => {}} />);
    expect(screen.getByTestId<HTMLInputElement>("monthday-1").checked).toBe(
      true,
    );
    expect(screen.getByTestId<HTMLInputElement>("monthday-15").checked).toBe(
      true,
    );
    expect(screen.getByTestId<HTMLInputElement>("monthday-31").checked).toBe(
      true,
    );
    expect(screen.getByTestId<HTMLInputElement>("monthday-10").checked).toBe(
      false,
    );
  });

  it("clicking unchecked day calls onChange with value added", async () => {
    const onChange = vi.fn();
    render(<MonthlySegment monthDays={[]} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("monthday-15").closest("label")!);
    expect(onChange).toHaveBeenCalledWith([15]);
  });

  it("clicking checked day calls onChange with value removed", async () => {
    const onChange = vi.fn();
    render(<MonthlySegment monthDays={[1, 15]} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("monthday-1").closest("label")!);
    expect(onChange).toHaveBeenCalledWith([15]);
  });

  it("clicking Last calls onChange with -1 added", async () => {
    const onChange = vi.fn();
    render(<MonthlySegment monthDays={[]} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("monthday--1").closest("label")!);
    expect(onChange).toHaveBeenCalledWith([-1]);
  });

  it("unchecking all days yields empty array", async () => {
    const onChange = vi.fn();
    render(<MonthlySegment monthDays={[5]} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("monthday-5").closest("label")!);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
