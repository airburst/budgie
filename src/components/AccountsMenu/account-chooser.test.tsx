import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountWithBalances } from "@/types/electron";
import { AccountChooser } from "./account-chooser";

const viewport = { desktop: false, listeners: new Set<() => void>() };

beforeEach(() => {
  viewport.desktop = false;
  viewport.listeners.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return viewport.desktop;
      },
      addEventListener: (_: string, l: () => void) => viewport.listeners.add(l),
      removeEventListener: (_: string, l: () => void) =>
        viewport.listeners.delete(l),
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

function makeAccounts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Account ${i + 1}`,
    number: null,
    type: "bank",
    computedBalance: 100 * (i + 1),
    clearedBalance: 0,
  })) as unknown as AccountWithBalances[];
}

function Location() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderChooser(count = 3, onAddAccount = vi.fn()) {
  render(
    <MemoryRouter initialEntries={["/accounts/1"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <AccountChooser
                accounts={makeAccounts(count)}
                currentAccountId={1}
                onAddAccount={onAddAccount}
              />
              <Location />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Change account" }));
  return { onAddAccount };
}

const location = () => screen.getByTestId("location").textContent;

describe("AccountChooser (phone drawer)", () => {
  it("opens without focusing an input and marks the selected account", async () => {
    renderChooser();
    await act(async () => {});
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByLabelText("Search accounts")).toBeNull();
    const selected = screen.getByRole("button", { current: true });
    expect(selected.textContent).toContain("Account 1");
  });

  it("navigates to the chosen account", () => {
    renderChooser();
    fireEvent.click(screen.getByRole("button", { name: /Account 2/ }));
    expect(location()).toBe("/accounts/2");
  });

  it("returns to the overview from All accounts", () => {
    renderChooser();
    fireEvent.click(screen.getByRole("button", { name: /All accounts/ }));
    expect(location()).toBe("/");
  });

  it("closing leaves the current account unchanged", () => {
    renderChooser();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(location()).toBe("/accounts/1");
  });

  it("hands off to Add account", () => {
    const { onAddAccount } = renderChooser();
    fireEvent.click(screen.getByRole("button", { name: /Add account/ }));
    expect(onAddAccount).toHaveBeenCalled();
  });

  it("filters long lists with search", () => {
    renderChooser(8);
    const search = screen.getByLabelText("Search accounts");
    expect(document.activeElement).not.toBe(search);
    fireEvent.change(search, { target: { value: "Account 7" } });
    expect(screen.getByRole("button", { name: /Account 7/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Account 2/ })).toBeNull();
  });
});
