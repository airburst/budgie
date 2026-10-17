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
    return null;
  },
}));

const transactions = [
  {
    id: 11,
    accountId: 1,
    date: "2026-09-10",
    payee: "Salary",
    amount: 40,
    categoryId: 5,
    notes: "September pay",
    cleared: false,
    reconciled: false,
  },
  {
    id: 12,
    accountId: 1,
    date: "2026-09-11",
    payee: "Coffee",
    amount: -10,
    categoryId: null,
    notes: null,
    cleared: false,
    reconciled: false,
  },
  {
    id: 13,
    accountId: 1,
    date: "2026-09-12",
    payee: "Already reconciled",
    amount: 5,
    categoryId: null,
    notes: null,
    cleared: true,
    reconciled: true,
  },
];

const updateTransaction = vi.fn();
const updateAccount = vi.fn();
const mutateAsync = vi.fn();

function mockWithTransactions(isPending = false) {
  mockUseTransactions.mockReturnValue({
    transactions,
    categories: [{ id: 5, name: "Income" }],
    reconcile: { mutateAsync, isPending },
  });
}

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

const checkbox = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;

beforeEach(() => {
  mockTransactionForm.mockClear();
  updateTransaction.mockReset();
  updateAccount.mockReset();
  mutateAsync.mockReset().mockResolvedValue(undefined);
  Object.assign(window, { api: { updateTransaction, updateAccount } });
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
  mockWithTransactions();
});

describe("Reconcile cards", () => {
  it("shows the four summary figures and only unreconciled cards", () => {
    renderPage();

    const summary = document.querySelector('[data-slot="reconcile-summary"]')!;
    for (const label of [
      "Opening Balance",
      "Cleared Balance",
      "Statement Balance",
      "Difference",
    ]) {
      expect(summary.textContent).toContain(label);
    }
    expect(summary.className).toContain("grid-cols-2");

    expect(checkbox("Salary")).toBeTruthy();
    expect(checkbox("Coffee")).toBeTruthy();
    expect(
      screen.queryByRole("checkbox", { name: "Already reconciled" }),
    ).toBeNull();
  });

  it("toggles exactly once from the card label and shows Selected text", () => {
    renderPage();
    expect(screen.queryByText("Selected")).toBeNull();

    fireEvent.click(screen.getByText("Salary", { selector: "label" }));

    expect(updateTransaction).toHaveBeenCalledTimes(1);
    expect(updateTransaction).toHaveBeenCalledWith(11, { cleared: true });
    expect(checkbox("Salary").checked).toBe(true);
    expect(screen.getByText("Selected")).toBeTruthy();
    expect(
      document.querySelector('[data-slot="reconcile-task-bar"]')?.textContent,
    ).toContain("1 selected");

    fireEvent.click(checkbox("Salary"));
    expect(updateTransaction).toHaveBeenCalledTimes(2);
    expect(updateTransaction).toHaveBeenLastCalledWith(11, { cleared: false });
    expect(screen.queryByText("Selected")).toBeNull();
  });

  it("Edit is a separate control that does not toggle selection", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Edit Salary" }));

    expect(updateTransaction).not.toHaveBeenCalled();
    expect(checkbox("Salary").checked).toBe(false);
    expect(mockTransactionForm).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, editingId: 11 }),
    );
  });

  it("keeps Finish disabled until the statement balances", () => {
    renderPage();
    const finish = screen.getByRole("button", {
      name: "Finish",
    }) as HTMLButtonElement;
    expect(finish.disabled).toBe(true);

    fireEvent.click(checkbox("Salary"));
    fireEvent.click(checkbox("Coffee"));
    // 100 + 40 - 10 = 130 against a 125 statement.
    expect(finish.disabled).toBe(true);
    expect(screen.getAllByText("Not balanced").length).toBeGreaterThan(0);
  });

  it("auto-matches, enables Finish when balanced and finishes once", async () => {
    renderPage(140);

    expect(screen.getByText(/Auto-matched 1 transaction/)).toBeTruthy();
    expect(checkbox("Salary").checked).toBe(true);
    const finish = screen.getByRole("button", {
      name: "Finish",
    }) as HTMLButtonElement;
    expect(finish.disabled).toBe(false);

    fireEvent.click(finish);
    await vi.waitFor(() => expect(updateAccount).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ toReconcile: [11], toUnclear: [] }),
    );
  });

  it("disables Finish while the reconcile mutation is pending", () => {
    mockWithTransactions(true);
    renderPage(140);
    expect(
      (screen.getByRole("button", { name: "Finish" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("renders a fixed task bar that reserves safe-area space", () => {
    renderPage();
    const bar = document.querySelector('[data-slot="reconcile-task-bar"]')!;
    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("env(safe-area-inset-bottom)");
    expect(bar.textContent).toContain("Cancel");
    expect(bar.textContent).toContain("Difference");
  });
});
