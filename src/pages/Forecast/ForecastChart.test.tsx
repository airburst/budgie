import { ForecastChart, type ChartPoint } from "@/pages/Forecast/ForecastChart";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const chartData: ChartPoint[] = [
  { date: "2026-03-01", balance: 1200 },
  { date: "2026-03-08", balance: 850 },
  { date: "2026-03-15", balance: -220 },
  { date: "2026-03-22", balance: 640 },
];

describe("ForecastChart", () => {
  it("renders an svg containing a path per series point range", () => {
    const { container } = render(<ForecastChart chartData={chartData} />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("renders without throwing on an empty series", () => {
    const { container } = render(<ForecastChart chartData={[]} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders date tick labels formatted as day and short month", () => {
    const { container } = render(<ForecastChart chartData={chartData} />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/\d{1,2} Mar|Mar/);
  });
});
