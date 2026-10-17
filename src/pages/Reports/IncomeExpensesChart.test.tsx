import {
  IncomeExpensesChart,
  type IncomeExpensesPoint,
} from "@/pages/Reports/IncomeExpensesChart";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const data: IncomeExpensesPoint[] = [
  { month: "2026-01", income: 3200, expenses: 2450 },
  { month: "2026-02", income: 3100, expenses: 2890 },
  { month: "2026-03", income: 3400, expenses: 2100 },
];

const formatMonth = (month: string) => `M${month.split("-")[1]}`;
const formatAmount = (value: number) => `£${value.toFixed(2)}`;
const formatAxisAmount = (value: number) => `£${(value / 1000).toFixed(1)}k`;

function renderChart(rows: IncomeExpensesPoint[] = data) {
  return render(
    <IncomeExpensesChart
      data={rows}
      formatMonth={formatMonth}
      formatAmount={formatAmount}
      formatAxisAmount={formatAxisAmount}
    />,
  );
}

describe("IncomeExpensesChart", () => {
  it("renders a bar per month per series", () => {
    const { container } = renderChart();
    const bars = container.querySelectorAll(
      '[data-ts-key="income-expenses-bars"] > *',
    );
    expect(bars.length).toBe(data.length * 2);
  });

  it("labels the x axis with formatted months", () => {
    const { container } = renderChart();
    const text = container.textContent ?? "";
    expect(text).toContain("M01");
    expect(text).toContain("M03");
  });

  it("renders a legend entry for each series", () => {
    const { container } = renderChart();
    const text = container.textContent ?? "";
    expect(text).toContain("Income");
    expect(text).toContain("Expenses");
  });

  it("renders without throwing on empty data", () => {
    const { container } = renderChart([]);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("offers income and expenses per month as text behind Show values", () => {
    renderChart();
    fireEvent.click(screen.getByRole("button", { name: /show values/i }));
    const list = screen.getByRole("list", {
      name: "Income versus expenses values",
    });
    expect(list.textContent).toContain("M01");
    expect(list.textContent).toContain("Income £3200.00");
    expect(list.textContent).toContain("Expenses £2450.00");
  });
});
