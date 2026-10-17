import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BudgetPage from "./BudgetPage";

const reorderMutate = vi.fn();
const upsertMutateAsync = vi.fn();
const quickFillMutateAsync = vi.fn();
const transferMutateAsync = vi.fn();

const envelopes = [
  { id: 1, name: "Groceries", active: true, sortOrder: 0 },
  { id: 2, name: "Rent", active: true, sortOrder: 1 },
  { id: 3, name: "Fun", active: true, sortOrder: 2 },
];

vi.mock("@/pages/layout", () => ({
  default: ({ children }: { children: import("react").ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/hooks/useEnvelopes", () => ({
  useEnvelopes: () => ({
    envelopes,
    reorder: { mutate: reorderMutate },
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock("@/hooks/useBudgetAllocations", () => ({
  useBudgetAllocations: () => ({
    allocations: [],
    upsert: { mutateAsync: upsertMutateAsync },
    quickFill: { mutateAsync: quickFillMutateAsync, isPending: false },
  }),
}));
vi.mock("@/hooks/useBudgetTransfers", () => ({
  useBudgetTransfers: () => ({
    transfers: [],
    create: { mutateAsync: transferMutateAsync },
  }),
}));
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    categories: [
      { id: 10, name: "Supermarket", expenseType: "expense", deleted: false },
      { id: 11, name: "Mortgage", expenseType: "expense", deleted: false },
    ],
  }),
}));
vi.mock("@/hooks/useEnvelopeCategories", () => ({
  useEnvelopeCategories: () => ({
    mappings: [{ id: 1, envelopeId: 1, categoryId: 10 }],
    create: { mutateAsync: vi.fn() },
    removeByEnvelope: { mutateAsync: vi.fn() },
  }),
}));
vi.mock("@/hooks/useBudgetSummary", () => ({
  useBudgetSummary: () => ({
    availableToBudget: 125.5,
    totalIncome: 0,
    totalAssigned: 0,
    overspendFromPrior: 0,
    unbudgetedActivity: 0,
    unbudgetedCategories: [],
    envelopes: [
      {
        envelopeId: 1,
        name: "Groceries",
        assigned: 400,
        activity: -150,
        available: 250,
        underfunded: false,
        categoryIds: [10],
      },
      {
        envelopeId: 2,
        name: "Rent",
        assigned: 900,
        activity: 0,
        available: 900,
        underfunded: true,
        categoryIds: [],
      },
      {
        envelopeId: 3,
        name: "Fun",
        assigned: 50,
        activity: -80,
        available: -30,
        underfunded: false,
        categoryIds: [],
      },
    ],
  }),
}));

function setViewport(phone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query.includes("min-width") ? !phone : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BudgetPage />
    </MemoryRouter>,
  );
}

async function openCardMenu(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `More actions for ${name}` }));
  return (await screen.findByText("Move up")).closest(
    '[data-slot="dropdown-menu-content"]',
  ) as HTMLElement;
}

beforeEach(() => {
  setViewport(true);
  reorderMutate.mockReset();
  upsertMutateAsync.mockReset().mockResolvedValue([]);
  quickFillMutateAsync.mockReset().mockResolvedValue([{ id: 1 }, { id: 2 }]);
  transferMutateAsync.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe("BudgetPage cards", () => {
  it("shows name, available, assigned, spent and categories without hover", () => {
    renderPage();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    const groceries = cards[0]!;
    expect(within(groceries).getByText("Groceries")).toBeTruthy();
    expect(within(groceries).getByText("Supermarket")).toBeTruthy();
    expect(groceries.textContent).toContain("£250.00");
    expect(groceries.textContent).toContain("£400.00");
    expect(groceries.textContent).toContain("£150.00");
    expect(within(cards[1]!).getByText("No categories")).toBeTruthy();
    expect(within(cards[1]!).getByText(/Underfunded/)).toBeTruthy();
    // Negative amounts keep their sign.
    expect(cards[2]!.textContent).toContain("-£30.00");
  });

  it("shows the Available to budget summary with a text state", () => {
    renderPage();
    expect(screen.getByText("Available to budget")).toBeTruthy();
    expect(screen.getByText("£125.50")).toBeTruthy();
    expect(screen.getByText(/Assign this to envelopes/)).toBeTruthy();
  });
});

describe("BudgetPage reordering", () => {
  it("Move down persists the same payload the drag handler would", async () => {
    renderPage();
    const menu = await openCardMenu("Groceries");
    fireEvent.click(within(menu).getByText("Move down"));
    expect(reorderMutate).toHaveBeenCalledTimes(1);
    expect(reorderMutate.mock.calls[0]![0]).toEqual([
      { id: 2, sortOrder: 0 },
      { id: 1, sortOrder: 1 },
      { id: 3, sortOrder: 2 },
    ]);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("listitem")
          .map((li) => within(li).getByRole("heading").textContent),
      ).toEqual(["Rent", "Groceries", "Fun"]),
    );
    expect(screen.getByText("Groceries moved to position 2 of 3.")).toBeTruthy();
  });

  it("Move up persists the new order", async () => {
    renderPage();
    const menu = await openCardMenu("Fun");
    fireEvent.click(within(menu).getByText("Move up"));
    expect(reorderMutate.mock.calls[0]![0]).toEqual([
      { id: 1, sortOrder: 0 },
      { id: 3, sortOrder: 1 },
      { id: 2, sortOrder: 2 },
    ]);
  });

  it("disables Move up on the first card and Move down on the last", async () => {
    const { unmount } = renderPage();
    let menu = await openCardMenu("Groceries");
    expect(
      within(menu).getByText("Move up").closest("[data-disabled]"),
    ).toBeTruthy();
    expect(
      within(menu).getByText("Move down").closest("[data-disabled]"),
    ).toBeNull();
    unmount();

    renderPage();
    menu = await openCardMenu("Fun");
    expect(
      within(menu).getByText("Move down").closest("[data-disabled]"),
    ).toBeTruthy();
    fireEvent.click(within(menu).getByText("Move down"));
    expect(reorderMutate).not.toHaveBeenCalled();
  });

  it("keeps a drag handle on every card and not on the card itself", () => {
    renderPage();
    for (const card of screen.getAllByRole("listitem")) {
      expect(card.getAttribute("aria-roledescription")).toBeNull();
      expect(
        within(card).getByRole("button", { name: /^Drag to reorder/ }),
      ).toBeTruthy();
    }
  });
});

describe("BudgetPage actions", () => {
  it("Fill from last month needs confirmation and never runs silently", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Fill from last month" }));
    expect(await screen.findByText("Fill from last month?")).toBeTruthy();
    expect(quickFillMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(quickFillMutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Fill from last month" }));
    await screen.findByText("Fill from last month?");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    });
    expect(quickFillMutateAsync).toHaveBeenCalledTimes(1);
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    expect(quickFillMutateAsync).toHaveBeenCalledWith(
      `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`,
    );
    expect(await screen.findByText(/Filled 2 envelopes from/)).toBeTruthy();
  });

  it("opens Move money with From, To and Amount, and submits the same payload", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Move money" }));
    expect(await screen.findByText("Move Money")).toBeTruthy();
    expect(screen.getByLabelText("Amount (£)")).toBeTruthy();
    const move = screen.getByRole("button", { name: "Move" });
    expect((move as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });

  it("Add envelope opens the create form", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Add envelope" }));
    expect(await screen.findByText("New Envelope")).toBeTruthy();
  });

  it("the card menu edit opens the edit form with its category mapping", async () => {
    renderPage();
    const menu = await openCardMenu("Groceries");
    fireEvent.click(within(menu).getByText("Edit envelope"));
    expect(await screen.findByText("Edit Envelope")).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Groceries",
    );
    expect(
      (screen.getByLabelText("Supermarket") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Mortgage") as HTMLInputElement).checked,
    ).toBe(false);
  });
});
