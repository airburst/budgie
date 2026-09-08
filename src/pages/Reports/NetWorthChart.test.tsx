import {
  NetWorthChart,
  type NetWorthPoint,
} from "@/pages/Reports/NetWorthChart";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const data: NetWorthPoint[] = [
  { month: "2026-01", netWorth: 18400 },
  { month: "2026-02", netWorth: 19250 },
  { month: "2026-03", netWorth: 21100 },
];

const formatMonth = (month: string) => `M${month.split("-")[1]}`;
const formatAmount = (value: number) => `£${value.toFixed(2)}`;
const formatAxisAmount = (value: number) => `£${(value / 1000).toFixed(1)}k`;

function renderChart(rows: NetWorthPoint[] = data) {
  return render(
    <NetWorthChart
      data={rows}
      formatMonth={formatMonth}
      formatAmount={formatAmount}
      formatAxisAmount={formatAxisAmount}
    />,
  );
}

describe("NetWorthChart", () => {
  it("renders one bar per data point", () => {
    const { container } = renderChart();
    const bars = container.querySelectorAll(
      '[data-ts-key="net-worth-bars"] > *',
    );
    expect(bars.length).toBe(data.length);
  });

  it("labels the x axis with formatted months", () => {
    const { container } = renderChart();
    expect(container.textContent).toContain("M02");
  });

  it("renders without throwing on empty data", () => {
    const { container } = renderChart([]);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
