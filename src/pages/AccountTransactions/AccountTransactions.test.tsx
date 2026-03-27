import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountTransactions from "./AccountTransactions";

const mockUseTransactions = vi.fn();
const mockUseAccounts = vi.fn();
const mockUsePreferences = vi.fn();

vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: (...args: unknown[]) => mockUseTransactions(...args),
}));

vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => mockUseAccounts(),
}));

vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => mockUsePreferences(),
}));

vi.mock("../layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/AccountsMenu/accounts-menu", () => ({
  default: () => <div>Accounts menu</div>,
}));

vi.mock("./TransactionForm", () => ({
  TransactionForm: () => null,
}));

vi.mock("./TransactionsTable", () => ({
  TransactionsTable: () => <div>Transactions table</div>,
}));

vi.mock("./ImportDialog", () => ({
  ImportDialog: () => null,
}));

vi.mock("./ReconciliationDialog", () => ({
  ReconciliationDialog: ({ open }: { open: boolean }) =>
    open ? <div>Reconciliation dialog open</div> : null,
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/accounts/1"]}>
      <Routes>
        <Route path="/accounts/:id" element={<AccountTransactions />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockUseTransactions.mockReturnValue({
    transactions: [],
    categories: [],
    update: { mutate: vi.fn() },
    remove: { mutate: vi.fn() },
  });
  mockUseAccounts.mockReturnValue({
    accounts: [{ id: 1, name: "Checking", balance: 1000 }],
  });
  mockUsePreferences.mockReturnValue({
    preferences: { hideReconciled: false, hideCleared: false },
    update: { mutate: vi.fn() },
  });
});

describe("AccountTransactions hotkeys", () => {
  it("opens reconciliation with R", () => {
    renderPage();

    fireEvent.keyDown(window, { key: "r" });

    expect(screen.getByText("Reconciliation dialog open")).toBeTruthy();
  });

  it("does not open reconciliation with Ctrl+R", () => {
    renderPage();

    fireEvent.keyDown(window, { key: "r", ctrlKey: true });

    expect(screen.queryByText("Reconciliation dialog open")).toBeNull();
  });
});
