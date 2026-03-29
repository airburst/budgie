import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Layout from "./layout";

vi.mock("@/components/header", () => ({
  default: () => <div>Header</div>,
}));

vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({
    preferences: {
      hideReconciled: true,
      hideCleared: false,
      autofillPayees: true,
    },
    update: { mutate: vi.fn() },
  }),
}));

function renderLayout() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <Layout>
              <div>Accounts Page</div>
            </Layout>
          }
        />
        <Route
          path="/scheduled"
          element={
            <Layout>
              <div>Subscriptions Page</div>
            </Layout>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout hotkeys", () => {
  it("navigates to Subscriptions with S", () => {
    renderLayout();

    fireEvent.keyDown(window, { key: "s" });

    expect(screen.getByText("Subscriptions Page")).toBeTruthy();
  });

  it("does not navigate to Subscriptions with R", () => {
    renderLayout();

    fireEvent.keyDown(window, { key: "r" });

    expect(screen.getByText("Accounts Page")).toBeTruthy();
  });
});
