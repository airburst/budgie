import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartValues } from "./chart-values";

const rows = [
  {
    label: "Jan 26",
    values: [
      { name: "Income", value: "£3,200.00" },
      { name: "Expenses", value: "£2,450.00" },
    ],
  },
  { label: "Feb 26", values: [{ name: "Income", value: "£3,100.00" }] },
];

describe("ChartValues", () => {
  it("is collapsed by default and reveals plain-text values on activation", () => {
    render(<ChartValues title="Income versus expenses" rows={rows} />);
    expect(screen.queryByText("£3,200.00")).toBeNull();

    const trigger = screen.getByRole("button", { name: /show values/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("for Income versus expenses");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("list", {
      name: "Income versus expenses values",
    });
    expect(list.textContent).toContain("Jan 26");
    expect(list.textContent).toContain("Expenses £2,450.00");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("hides the values again", () => {
    render(<ChartValues title="Net worth" rows={rows} />);
    const trigger = screen.getByRole("button", { name: /show values/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /hide values/i }));
    expect(screen.queryByRole("list")).toBeNull();
  });
});
