import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionForm } from "../AccountTransactions/TransactionForm";
import ReconcilePage from "./ReconcilePage";

const mockUseTransactions = vi.fn();
const mockUseAccounts = vi.fn();
const mockTransactionForm = vi.fn(
  (_props: ComponentProps<typeof TransactionForm>) => null,
);

vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: (...args: unknown[]) => mockUseTransactions(...args),
}));

vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => mockUseAccounts(),
}));

vi.mock("../layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../AccountTransactions/TransactionForm", () => ({
  TransactionForm: (props: ComponentProps<typeof TransactionForm>) => {
    mockTransactionForm(props);
    return props.open ? <div>Transaction form open</div> : null;
  },
}));

function renderPage(statementBalance = 125) {
  render(
    <MemoryRouter
      initialEntries={[
        `/reconcile/1?date=2026-09-13&balance=${statementBalance}`,
      ]}
    >
      <Routes>
        <Route path="/reconcile/:id" element={<ReconcilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockTransactionForm.mockClear();
  mockUseAccounts.mockReturnValue({
    accounts: [
      {
        id: 1,
        name: "Checking",
        type: "checking",
        balance: 100,
        lastReconcileBalance: 100,
      },
    ],
  });
  mockUseTransactions.mockReturnValue({
    transactions: [],
    categories: [],
    reconcile: { mutateAsync: vi.fn(), isPending: false },
  });
});

describe("Reconcile Auto Balance", () => {
  it("opens a cleared transaction for the discrepancy with Payee focus", () => {
    renderPage();

    const autoBalance = screen.getByRole("button", { name: "Auto Balance" });
    const addTransaction = screen.getByRole("button", {
      name: "Add Transaction",
    });

    expect(
      autoBalance.compareDocumentPosition(addTransaction) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(autoBalance.className).toContain("bg-secondary");

    fireEvent.click(autoBalance);

    expect(screen.getByText("Transaction form open")).toBeTruthy();
    expect(mockTransactionForm).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        editingId: null,
        accountId: 1,
        defaultAmount: 25,
        defaultCleared: true,
        focusAmountOnOpen: false,
      }),
    );
  });

  it("preserves a negative discrepancy for a withdrawal", () => {
    renderPage(75);

    fireEvent.click(screen.getByRole("button", { name: "Auto Balance" }));

    expect(mockTransactionForm).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultAmount: -25 }),
    );
  });
});
