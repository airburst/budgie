import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Category, Transaction } from "@/types/electron";
import { TransactionsList } from "./TransactionsList";

const categories: Category[] = [{ id: 7, name: "Groceries" } as Category];

const today = new Date().toISOString().slice(0, 10);
const future = new Date(Date.now() + 14 * 86_400_000)
  .toISOString()
  .slice(0, 10);

const base: Transaction = {
  id: 1,
  accountId: 1,
  date: today,
  payee: "Supermarket",
  amount: -42.8,
  categoryId: 7,
  notes: "Weekly shop",
  cleared: false,
  reconciled: false,
  transferTransactionId: null,
} as Transaction;

function renderList(
  transactions: Transaction[],
  overrides: Partial<Parameters<typeof TransactionsList>[0]> = {},
) {
  const onView = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onToggleCleared = vi.fn();
  render(
    <TransactionsList
      transactions={transactions}
      allTransactions={transactions}
      categories={categories}
      openingBalance={1000}
      onEdit={onEdit}
      onView={onView}
      onDelete={onDelete}
      onToggleCleared={onToggleCleared}
      {...overrides}
    />,
  );
  return { onView, onEdit, onDelete, onToggleCleared };
}

describe("TransactionsList", () => {
  it("shows an empty state", () => {
    renderList([]);
    expect(screen.getByText("No transactions yet.")).toBeTruthy();
  });

  it("opens details when the card button is tapped", () => {
    const { onView } = renderList([base]);
    fireEvent.click(screen.getByRole("button", { name: "Supermarket" }));
    expect(onView).toHaveBeenCalledWith(1);
  });

  it("toggles cleared without opening details", () => {
    const { onView, onToggleCleared } = renderList([base]);
    const checkbox = screen.getAllByLabelText("Mark Supermarket cleared")[0]!;
    fireEvent.click(checkbox);
    expect(onToggleCleared).toHaveBeenCalledWith(1, true);
    expect(onView).not.toHaveBeenCalled();
  });

  it("shows signed amounts", () => {
    renderList([
      base,
      { ...base, id: 2, payee: "Salary", amount: 2000, notes: null },
    ]);
    expect(screen.getAllByText("-£42.80").length).toBeGreaterThan(0);
    expect(screen.getAllByText("£2,000.00").length).toBeGreaterThan(0);
  });

  it("hides edit/delete for reconciled transactions", () => {
    renderList([{ ...base, reconciled: true, cleared: true }]);
    expect(
      screen.queryByRole("button", { name: "Edit Supermarket" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "More actions for Supermarket" }),
    ).toBeNull();
    expect(screen.getAllByText(/Reconciled/).length).toBeGreaterThan(0);
  });

  it("renders a truncated notes preview", () => {
    renderList([base]);
    expect(screen.getAllByText("Weekly shop").length).toBeGreaterThan(0);
  });

  it("labels future-dated transactions as Upcoming", () => {
    renderList([
      base,
      { ...base, id: 2, payee: "Future Bill", date: future },
    ]);
    expect(screen.getByText("Upcoming")).toBeTruthy();
  });
});
