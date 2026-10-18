import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { AccountWithBalances } from "@/types/electron";
import { AccountsList } from "./AccountsList";

vi.mock("./AccountForm", () => ({
  AccountForm: ({
    open,
    editingId,
  }: {
    open: boolean;
    editingId?: number | null;
  }) =>
    open ? <div>Account form {editingId ?? "new"}</div> : null,
}));
vi.mock("../AccountTransactions/ReconciliationDialog", () => ({
  ReconciliationDialog: ({ account }: { account: { name: string } }) => (
    <div>Reconcile {account.name}</div>
  ),
}));

const base = {
  currency: "GBP",
  notes: null,
  interestRate: null,
  creditLimit: null,
  balance: 0,
  pendingReconcileBalance: null,
  pendingReconcileDate: null,
  lastReconcileBalance: null,
  createdAt: null,
} as const;

const accounts = [
  {
    ...base,
    id: 1,
    name: "Current Account",
    number: "12344821",
    type: "bank",
    computedBalance: 4285.6,
    clearedBalance: 4210.6,
    lastReconcileDate: "2026-09-30",
  },
  {
    ...base,
    id: 3,
    name: "Credit Card",
    number: null,
    type: "credit_card",
    creditLimit: 5000,
    computedBalance: -1250,
    clearedBalance: -1250,
    lastReconcileDate: null,
  },
] as unknown as AccountWithBalances[];

function Location() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderList(props: Partial<Parameters<typeof AccountsList>[0]> = {}) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <AccountsList accounts={accounts} {...props} />
              <Location />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AccountsList", () => {
  it("shows the unchanged overview total and one card per account", () => {
    renderList();
    expect(screen.getByText("All accounts · Total balance")).toBeTruthy();
    expect(screen.getByText("£3,035.60")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Bank · •• 4821")).toBeTruthy();
  });

  it("shows remaining credit only for credit cards with a limit", () => {
    renderList();
    const [bank, card] = screen.getAllByRole("listitem");
    expect(within(bank!).queryByText(/Remaining credit/)).toBeNull();
    expect(within(card!).getAllByText(/Remaining credit/).length).toBeGreaterThan(0);
    expect(within(card!).getAllByText("£3,750.00").length).toBeGreaterThan(0);
  });

  it("navigates from the card link", () => {
    renderList();
    fireEvent.click(screen.getByRole("link", { name: "Current Account" }));
    expect(screen.getByTestId("location").textContent).toBe("/accounts/1");
  });

  it("opens edit and reconcile without navigating", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Edit Credit Card" }));
    expect(screen.getByText("Account form 3")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Reconcile Current Account" }),
    );
    expect(screen.getByText("Reconcile Current Account")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("distinguishes loading, error and empty states", () => {
    const onRetry = vi.fn();
    const { rerender } = renderList({ accounts: [], isLoading: true });
    expect(screen.getByLabelText("Loading accounts")).toBeTruthy();
    expect(screen.queryByText(/No accounts yet/)).toBeNull();

    rerender(
      <MemoryRouter>
        <AccountsList accounts={[]} isError onRetry={onRetry} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn't load your accounts.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <AccountsList accounts={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No accounts yet/)).toBeTruthy();
  });
});
