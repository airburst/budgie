import type { Account, ScheduledTransaction } from "@/types/electron";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScheduledTransactions from "./ScheduledTransactions";

const mockUseScheduled = vi.fn();
const mockSkip = vi.fn();

vi.mock("@/hooks/useScheduledTransactions", () => ({
  useScheduledTransactions: () => mockUseScheduled(),
}));

vi.mock("../layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./ScheduledPaymentForm", () => ({
  ScheduledPaymentDialog: (props: {
    open: boolean;
    editingId: number | null;
    initialMode?: string;
    onRecord?: (id: number) => void;
    onSkip?: (id: number) => void;
  }) =>
    props.open ? (
      <div data-testid="sheet">
        sheet:{String(props.editingId)}:{props.initialMode}
        <button onClick={() => props.onRecord?.(props.editingId!)}>
          sheet-record
        </button>
        <button onClick={() => props.onSkip?.(props.editingId!)}>
          sheet-skip
        </button>
      </div>
    ) : null,
}));

vi.mock("./RecordPaymentDialog", () => ({
  RecordPaymentDialog: (props: {
    open: boolean;
    scheduledId: number | null;
  }) =>
    props.open ? (
      <div data-testid="record">record:{String(props.scheduledId)}</div>
    ) : null,
}));

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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
    amount: -12,
    rrule: "FREQ=MONTHLY",
    nextDueDate: isoDateOffset(2),
    autoPost: false,
    notes: null,
    active: true,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

const scheduled = [
  makeTx({ id: 1, payee: "Netflix", amount: -12, accountId: 1 }),
  makeTx({ id: 2, payee: "Salary", amount: 2000, accountId: 2 }),
  makeTx({ id: 3, payee: "Rent", amount: -800, accountId: 2 }),
];

const viewport = { desktop: false };

beforeEach(() => {
  mockSkip.mockReset();
  viewport.desktop = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return viewport.desktop || !query.includes("min-width");
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  mockUseScheduled.mockReturnValue({
    scheduled,
    accounts,
    remove: { mutate: vi.fn() },
    skip: { mutate: mockSkip },
  });
});

afterEach(() => vi.unstubAllGlobals());

function cards() {
  return within(
    screen.getByRole("list", { name: "Subscriptions" }),
  ).getAllByRole("listitem");
}

function summary() {
  return screen.getByRole("region", { name: "Due in next 7 days" });
}

describe("ScheduledTransactions page skip", () => {
  it("asks before skipping, then skips only that schedule", () => {
    render(<ScheduledTransactions />);
    fireEvent.click(screen.getByRole("button", { name: "Skip Netflix" }));
    expect(mockSkip).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Skip this payment?")).toBeTruthy();
    expect(dialog.textContent).toContain("Netflix due");
    expect(dialog.textContent).toContain("Nothing is recorded");

    fireEvent.click(within(dialog).getByRole("button", { name: "Skip" }));
    expect(mockSkip).toHaveBeenCalledTimes(1);
    expect(mockSkip.mock.calls[0]![0]).toMatchObject({ id: 1 });
  });

  it("Cancel leaves the schedule alone", () => {
    render(<ScheduledTransactions />);
    fireEvent.click(screen.getByRole("button", { name: "Skip Netflix" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it("warns that skipping the last occurrence removes the schedule", () => {
    mockUseScheduled.mockReturnValue({
      scheduled: [
        makeTx({ id: 9, payee: "Once off", rrule: "FREQ=DAILY;COUNT=1" }),
      ],
      accounts,
      remove: { mutate: vi.fn() },
      skip: { mutate: mockSkip },
    });
    render(<ScheduledTransactions />);
    fireEvent.click(screen.getByRole("button", { name: "Skip Once off" }));
    expect(screen.getByRole("dialog").textContent).toContain(
      "removes the schedule",
    );
  });

  it("skipping from the details sheet closes it and confirms first", () => {
    render(<ScheduledTransactions />);
    fireEvent.click(screen.getByRole("button", { name: "Netflix" }));
    fireEvent.click(screen.getByRole("button", { name: "sheet-skip" }));
    expect(screen.queryByTestId("sheet")).toBeNull();
    expect(screen.getByText("Skip this payment?")).toBeTruthy();
    expect(mockSkip).not.toHaveBeenCalled();
  });
});

describe("ScheduledTransactions page (phone)", () => {
  it("collapses the calendar on entry and toggles it", () => {
    render(<ScheduledTransactions />);
    expect(screen.queryByLabelText("Next due dates calendar")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show calendar" }));
    expect(screen.getByLabelText("Next due dates calendar")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide calendar" }));
    expect(screen.queryByLabelText("Next due dates calendar")).toBeNull();
  });

  it("orders title, filter, summary, calendar disclosure, sort then cards", () => {
    render(<ScheduledTransactions />);
    const nodes = [
      screen.getByRole("heading", { name: "Subscriptions" }),
      screen.getByRole("button", { name: /Filter accounts/ }),
      summary(),
      screen.getByRole("button", { name: "Show calendar" }),
      screen.getByRole("button", { name: /^Sort:/ }),
      screen.getByRole("list", { name: "Subscriptions" }),
    ];
    for (let i = 0; i < nodes.length - 1; i++) {
      expect(
        nodes[i]!.compareDocumentPosition(nodes[i + 1]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("shows income and outgoing for All accounts", () => {
    render(<ScheduledTransactions />);
    expect(within(summary()).getByText("All accounts")).toBeTruthy();
    expect(within(summary()).getByText("£2,000.00")).toBeTruthy();
    expect(within(summary()).getByText("£812.00")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Filter accounts, All accounts/ }),
    );
  });

  it("shares the account filter between list and summary", () => {
    render(<ScheduledTransactions />);
    fireEvent.click(screen.getByRole("button", { name: /Filter accounts/ }));
    fireEvent.click(screen.getByLabelText("Savings"));

    expect(
      screen.getByRole("button", { name: "Filter accounts, Current" }),
    ).toBeTruthy();
    expect(within(summary()).getByText("Current")).toBeTruthy();
    expect(within(summary()).getAllByText("£0.00")).toHaveLength(1);
    expect(within(summary()).getByText("£12.00")).toBeTruthy();
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Netflix" })).toBeTruthy();
  });

  it("filters the calendar dots by account too", () => {
    render(<ScheduledTransactions />);
    fireEvent.click(screen.getByRole("button", { name: "Show calendar" }));
    const calendar = screen.getByLabelText("Next due dates calendar");
    const dueCells = () =>
      within(calendar).queryAllByRole("gridcell", { name: /payment due/ });
    // Netflix, Salary and Rent share a due date, so one dot cell.
    expect(dueCells()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Filter accounts/ }));
    fireEvent.click(screen.getByLabelText("Current"));
    fireEvent.click(screen.getByLabelText("Savings"));
    expect(dueCells()).toHaveLength(0);
  });

  it("shows a filter-empty state that differs from the empty state", () => {
    render(<ScheduledTransactions />);
    fireEvent.click(screen.getByRole("button", { name: /Filter accounts/ }));
    fireEvent.click(screen.getByLabelText("Current"));
    fireEvent.click(screen.getByLabelText("Savings"));

    expect(screen.getByText("No subscriptions for No accounts.")).toBeTruthy();
    expect(screen.queryByText("No subscriptions yet.")).toBeNull();
    const reset = screen
      .getAllByRole("button", { name: "Show all accounts" })
      .find((b) => b.closest('[data-slot="filter-empty"]'))!;
    fireEvent.click(reset);
    expect(cards()).toHaveLength(3);
  });

  it("shows the true empty state when nothing is scheduled", () => {
    mockUseScheduled.mockReturnValue({
      scheduled: [],
      accounts,
      remove: { mutate: vi.fn() },
    });
    render(<ScheduledTransactions />);
    expect(screen.getByText("No subscriptions yet.")).toBeTruthy();
    expect(screen.queryByText(/No subscriptions for/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Add your first subscription" }),
    ).toBeTruthy();
  });

  it("card tap opens details only; Record payment is explicit", () => {
    render(<ScheduledTransactions />);
    fireEvent.click(screen.getByRole("button", { name: "Netflix" }));
    expect(screen.getByTestId("sheet").textContent).toContain(
      "sheet:1:details",
    );
    expect(screen.queryByTestId("record")).toBeNull();

    fireEvent.click(screen.getByText("sheet-record"));
    expect(screen.queryByTestId("sheet")).toBeNull();
    expect(screen.getByTestId("record").textContent).toBe("record:1");
  });

  it("Record payment on a card opens the record dialog", () => {
    render(<ScheduledTransactions />);
    fireEvent.click(
      screen.getByRole("button", { name: "Record payment for Rent" }),
    );
    expect(screen.getByTestId("record").textContent).toBe("record:3");
    expect(screen.queryByTestId("sheet")).toBeNull();
  });

  it("Edit and Add open the editor directly", () => {
    render(<ScheduledTransactions />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Salary" }));
    expect(screen.getByTestId("sheet").textContent).toContain("sheet:2:edit");
    fireEvent.click(screen.getByRole("button", { name: "Add subscription" }));
    expect(screen.getByTestId("sheet").textContent).toContain(
      "sheet:null:edit",
    );
  });
});

describe("ScheduledTransactions page (desktop)", () => {
  beforeEach(() => {
    viewport.desktop = true;
  });

  it("keeps the calendar panel visible without a disclosure", () => {
    render(<ScheduledTransactions />);
    expect(screen.getByLabelText("Next due dates calendar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /calendar$/ })).toBeNull();
    expect(within(summary()).getByText("All accounts")).toBeTruthy();
  });
});
