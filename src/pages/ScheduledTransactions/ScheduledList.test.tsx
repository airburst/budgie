import type { Account, ScheduledTransaction } from "@/types/electron";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduledList } from "./ScheduledList";

const accounts = [
  { id: 1, name: "Current" },
  { id: 2, name: "Savings" },
] as Account[];

function makeTx(
  overrides: Partial<ScheduledTransaction> = {},
): ScheduledTransaction {
  return {
    id: 1,
    accountId: 1,
    categoryId: null,
    payee: "Netflix",
    amount: -12.99,
    rrule: "FREQ=MONTHLY",
    nextDueDate: "2026-03-20",
    autoPost: false,
    notes: null,
    active: true,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

const rows = [
  makeTx({ id: 1, payee: "Netflix", nextDueDate: "2026-03-20" }),
  makeTx({
    id: 2,
    payee: "Salary",
    amount: 2500,
    accountId: 2,
    nextDueDate: "2026-03-10",
    rrule: "FREQ=WEEKLY",
  }),
  makeTx({
    id: 3,
    payee: "Gym",
    amount: -30,
    nextDueDate: "2026-03-15",
    active: false,
    autoPost: true,
    daysInAdvance: 2,
  }),
];

function renderList(
  items: ScheduledTransaction[] = rows,
  overrides: Partial<Parameters<typeof ScheduledList>[0]> = {},
) {
  const handlers = {
    onView: vi.fn(),
    onRecord: vi.fn(),
    onSkip: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <ScheduledList
      scheduledTransactions={items}
      accounts={accounts}
      emptyContent={<p>Nothing here</p>}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

const payees = () =>
  screen
    .getAllByRole("listitem")
    .map((li) => li.querySelector("button")?.textContent);

describe("ScheduledList", () => {
  it("renders the empty content instead of cards", () => {
    renderList([]);
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("button", { name: /Sort:/ })).toBeNull();
  });

  it("sorts by next due ascending by default", () => {
    renderList();
    expect(payees()).toEqual(["Salary", "Gym", "Netflix"]);
    expect(screen.getByRole("button", { name: /Sort: Next due/ })).toBeTruthy();
  });

  it("shows payee, signed amount, due date, account, recurrence and status as text", () => {
    renderList();
    const gym = screen.getByRole("button", { name: "Gym" }).closest("li")!;
    expect(within(gym).getByText("-£30.00")).toBeTruthy();
    expect(within(gym).getByText("15/03/2026")).toBeTruthy();
    expect(within(gym).getByText("Current")).toBeTruthy();
    expect(within(gym).getByText("Monthly")).toBeTruthy();
    expect(
      within(gym).getByText("Paused · Auto-post 2 days ahead"),
    ).toBeTruthy();
    const salary = screen
      .getByRole("button", { name: "Salary" })
      .closest("li")!;
    expect(within(salary).getByText("£2,500.00")).toBeTruthy();
    expect(within(salary).getByText("Weekly")).toBeTruthy();
    expect(within(salary).getByText("Savings")).toBeTruthy();
  });

  it("tapping the card opens details and never records", () => {
    const { onView, onRecord, onEdit, onDelete } = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Netflix" }));
    expect(onView).toHaveBeenCalledWith(1);
    expect(onRecord).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("Record payment, Edit and Delete are separate explicit actions", () => {
    const { onView, onRecord, onEdit } = renderList();
    fireEvent.click(
      screen.getByRole("button", { name: "Record payment for Netflix" }),
    );
    expect(onRecord).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Edit Netflix" }));
    expect(onEdit).toHaveBeenCalledWith(1);
    expect(onView).not.toHaveBeenCalled();
  });

  it("Skip is its own explicit action and is offered only with a due date", () => {
    const { onSkip, onView, onRecord } = renderList([
      makeTx({ id: 1, payee: "Netflix" }),
      makeTx({ id: 2, payee: "Undated", nextDueDate: null }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Skip Netflix" }));
    expect(onSkip).toHaveBeenCalledWith(1);
    expect(onView).not.toHaveBeenCalled();
    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Skip Undated" })).toBeNull();
  });

  it("marks paused schedules with a Paused badge beside the payee", () => {
    renderList();
    const gym = screen.getByRole("button", { name: "Gym" }).closest("li")!;
    const badges = within(gym).getAllByText("Paused");
    expect(badges.some((el) => el.getAttribute("data-slot") === "badge")).toBe(
      true,
    );
    const netflix = screen
      .getByRole("button", { name: "Netflix" })
      .closest("li")!;
    expect(within(netflix).queryByText("Paused")).toBeNull();
  });

  it("confirms before deleting", () => {
    const { onDelete } = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Delete Netflix" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete subscription?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it.each([
    ["Payee, A to Z", ["Gym", "Netflix", "Salary"]],
    ["Payee, Z to A", ["Salary", "Netflix", "Gym"]],
    ["Amount, lowest first", ["Gym", "Netflix", "Salary"]],
    ["Amount, highest first", ["Salary", "Netflix", "Gym"]],
    ["Account, A to Z", ["Netflix", "Gym", "Salary"]],
    ["Account, Z to A", ["Salary", "Netflix", "Gym"]],
    ["Next due, soonest first", ["Salary", "Gym", "Netflix"]],
    ["Next due, latest first", ["Netflix", "Gym", "Salary"]],
  ])("sorts by %s from the menu", async (label, expected) => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: /^Sort:/ }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: label }));
    await waitFor(() => expect(payees()).toEqual(expected));
  });

  it("sorts schedules without a next due date last", () => {
    renderList([
      makeTx({ id: 1, payee: "Later", nextDueDate: null }),
      makeTx({ id: 2, payee: "Sooner", nextDueDate: "2026-03-01" }),
    ]);
    expect(payees()).toEqual(["Sooner", "Later"]);
  });
});
