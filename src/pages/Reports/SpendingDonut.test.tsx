import {
  SpendingDonut,
  type SpendingSlice,
} from "@/pages/Reports/SpendingDonut";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const slices: SpendingSlice[] = [
  { name: "Groceries", amount: 420.5, fill: "hsl(160, 60%, 45%)" },
  { name: "Transport", amount: 180.25, fill: "hsl(220, 70%, 55%)" },
  { name: "Utilities", amount: 96, fill: "hsl(0, 70%, 60%)" },
];

const formatAmount = (value: number) => `£${value.toFixed(2)}`;

function renderDonut(data: SpendingSlice[] = slices) {
  return render(
    <SpendingDonut slices={data} total="£696.75" formatAmount={formatAmount} />,
  );
}

describe("SpendingDonut", () => {
  it("renders one arc per slice", () => {
    const { container } = renderDonut();
    const arcs = container.querySelectorAll(
      '[data-ts-key="spending-slices"] path',
    );
    expect(arcs.length).toBe(slices.length);
  });

  it("renders the running total in the doughnut hole", () => {
    const { container } = renderDonut();
    expect(container.textContent).toContain("£696.75");
  });

  it("renders a legend entry per category", () => {
    const { container } = renderDonut();
    const text = container.textContent ?? "";
    for (const slice of slices) {
      expect(text).toContain(slice.name);
    }
  });

  it("renders without throwing when there is nothing to show", () => {
    const { container } = renderDonut([]);
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
