import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountTransactions from "./AccountTransactions";

const mockUseTransactions = vi.fn();
const mockUseAccounts = vi.fn();
const mockUsePreferences = vi.fn();
let qifImport = true;

vi.mock("@/hooks/usePlatform", () => ({
  usePlatform: () => ({ capabilities: { qifImport } }),
}));

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

vi.mock("@/components/AccountsMenu/account-context-card", () => ({
  AccountContextCard: () => <div>Selected account</div>,
}));

vi.mock("./TransactionForm", () => ({
  TransactionForm: () => null,
}));

vi.mock("./TransactionsList", () => ({
  TransactionsList: () => <div>Transactions list</div>,
}));

vi.mock("../Home/AccountForm", () => ({
  AccountForm: () => null,
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
  qifImport = true;
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

describe("AccountTransactions header", () => {
  it("shows Reconcile, Forecast, Edit account and Import in the More menu", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    const menu = (await screen.findByText("Edit account")).closest(
      '[data-slot="dropdown-menu-content"]',
    ) as HTMLElement;
    expect(within(menu).getByText("Reconcile")).toBeTruthy();
    expect(within(menu).getByText("Forecast")).toBeTruthy();
    expect(within(menu).getByText("Import")).toBeTruthy();

    fireEvent.click(within(menu).getByText("Edit account"));
    expect(screen.queryByText("Reconciliation dialog open")).toBeNull();
  });

  it("hides Import where QIF import is unsupported (web)", async () => {
    qifImport = false;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));

    const menu = (await screen.findByText("Edit account")).closest(
      '[data-slot="dropdown-menu-content"]',
    ) as HTMLElement;
    expect(within(menu).queryByText("Import")).toBeNull();
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
  });

  it("shows an unlabelled Filter button with no active filters", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Filter transactions" })).toBeTruthy();
    expect(screen.queryByText(/Filter ·/)).toBeNull();
  });

  it("summarises active filters as text, not colour alone", () => {
    mockUsePreferences.mockReturnValue({
      preferences: { hideReconciled: true, hideCleared: true },
      update: { mutate: vi.fn() },
    });
    renderPage();
    expect(
      screen.getByRole("button", {
        name: "Filter transactions, Hiding reconciled & cleared",
      }),
    ).toBeTruthy();
    expect(screen.getByText("· Hiding reconciled & cleared")).toBeTruthy();
    expect(screen.getByText("· 2")).toBeTruthy();
  });
});
