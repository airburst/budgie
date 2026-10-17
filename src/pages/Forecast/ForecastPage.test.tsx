import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForecastPage from "./ForecastPage";

const accounts = [
  { id: 1, name: "Current", number: null, balance: 1000, computedBalance: 1000 },
];
const transactions = [
  {
    id: 1,
    accountId: 1,
    date: "2026-03-15",
    payee: "Council tax",
    amount: -100,
    categoryId: 3,
    notes: "Band D annual instalment, paid by direct debit on the 15th",
  },
  {
    id: 2,
    accountId: 1,
    date: "2026-03-01",
    payee: "Already posted",
    amount: -5,
    categoryId: null,
    notes: null,
  },
];
const categories = [{ id: 3, name: "Household bills", expenseType: "expense" }];
const scheduled = [
  {
    id: 7,
    accountId: 1,
    transferToAccountId: null,
    active: 1,
    rrule: "FREQ=MONTHLY;COUNT=1",
    nextDueDate: "2026-03-20",
    payee: "Gym",
    amount: -30,
    categoryId: null,
    notes: null,
  },
];

vi.mock("@/hooks/useAccounts", () => ({ useAccounts: () => ({ accounts }) }));
vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({ transactions, categories }),
}));
vi.mock("@/hooks/useScheduledTransactions", () => ({
  useScheduledTransactions: () => ({ scheduled }),
}));
vi.mock("../layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./ForecastChart", () => ({ ForecastChart: () => null }));

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
    <MemoryRouter initialEntries={["/forecast/1"]}>
      <Routes>
        <Route path="/forecast/:id" element={<ForecastPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const card = (payee: string) =>
  screen
    .getAllByRole("listitem")
    .find((li) => li.getAttribute("data-slot") === "forecast-card" && li.textContent?.includes(payee))!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-07T12:00:00"));
  setViewport(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ForecastPage cards", () => {
  it("lists only future rows with signed amount, projected balance and scheduled label", () => {
    renderPage();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(screen.queryByText("Already posted")).toBeNull();

    const tax = card("Council tax");
    expect(within(tax).getByText("-£100.00")).toBeTruthy();
    expect(tax.textContent).toContain("Projected balance");
    expect(tax.textContent).toContain("£895.00");
    expect(tax.textContent).toContain("Included");
    expect(tax.textContent).not.toContain("Scheduled");

    const gym = card("Gym");
    expect(gym.textContent).toContain("Scheduled");
    expect(gym.textContent).toContain("£865.00");
  });

  it("toggles inclusion exactly once from the card-wide label and checkbox", () => {
    renderPage();
    const tax = card("Council tax");
    const checkbox = within(tax).getByRole("checkbox", {
      name: /council tax/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(within(tax).getByText("Council tax"));
    expect(checkbox.checked).toBe(false);
    expect(tax.textContent).toContain("Excluded from forecast");
    // Later rows no longer include the excluded amount.
    expect(card("Gym").textContent).toContain("£965.00");

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(card("Gym").textContent).toContain("£865.00");
  });

  it("details button shows the full memo and category without toggling", () => {
    renderPage();
    const tax = card("Council tax");
    const checkbox = within(tax).getByRole("checkbox") as HTMLInputElement;

    fireEvent.click(
      within(tax).getByRole("button", { name: "Details for Council tax" }),
    );
    expect(checkbox.checked).toBe(true);

    const dialog = document.querySelector('[data-slot="drawer-popup"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain(
      "Band D annual instalment, paid by direct debit on the 15th",
    );
    expect(dialog.textContent).toContain("Household bills");
    expect(dialog.textContent).toContain("Existing future transaction");

    fireEvent.click(within(dialog as HTMLElement).getByRole("button", { name: "Close" }));
  });

  it("Refresh explicitly resets inclusions", () => {
    renderPage();
    const tax = card("Council tax");
    const checkbox = within(tax).getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(
      (within(card("Council tax")).getByRole("checkbox") as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("help opens as a drawer on phones and a dialog on desktop", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(await screen.findByText("Forecast Help")).toBeTruthy();
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeTruthy();
  });

  it("help renders the desktop dialog from md", async () => {
    setViewport(false);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(await screen.findByText("Forecast Help")).toBeTruthy();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeTruthy();
  });
});
