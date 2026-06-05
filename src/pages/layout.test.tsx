import { GLOBAL_ROUTE_SHORTCUTS, SYSTEM_SHORTCUTS } from "@/lib/shortcuts";
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
        <Route
          path="/budget"
          element={
            <Layout>
              <div>Budget Page</div>
            </Layout>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Layout hotkeys", () => {
  it("keeps Settings built-in global shortcuts in sync with layout route hotkeys", () => {
    const layoutKeys = GLOBAL_ROUTE_SHORTCUTS.map(
      (s) => `${s.ctrl ? "ctrl+" : ""}${s.key.toLowerCase()}`,
    ).sort();

    const settingsGlobalKeys = SYSTEM_SHORTCUTS.filter((s) => !s.note)
      .map((s) => `${s.ctrl ? "ctrl+" : ""}${s.key.toLowerCase()}`)
      .sort();

    expect(settingsGlobalKeys).toEqual(layoutKeys);
  });

  it("navigates to Subscriptions with S", () => {
    renderLayout();

    fireEvent.keyDown(window, { key: "s" });

    expect(screen.getByText("Subscriptions Page")).toBeTruthy();
  });

  it("navigates to Budget with B", () => {
    renderLayout();

    fireEvent.keyDown(window, { key: "b" });

    expect(screen.getByText("Budget Page")).toBeTruthy();
  });

  it("does not navigate to Subscriptions with R", () => {
    renderLayout();

    fireEvent.keyDown(window, { key: "r" });

    expect(screen.getByText("Accounts Page")).toBeTruthy();
  });
});
