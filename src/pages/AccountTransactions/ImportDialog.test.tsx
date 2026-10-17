import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportDialog } from "./ImportDialog";

const create = { mutateAsync: vi.fn() };
const account = {
  id: 1,
  name: "Current",
  type: "bank",
  lastReconcileDate: null,
};
// Stable identities: a fresh array per render would reset the selection.
const noTransactions: never[] = [];
const accounts = [account];

vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({ transactions: noTransactions, create }),
}));
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ accounts }),
}));

const QIF = `!Type:Bank
D01/03/2026
PCoffee Shop
T-3.50
^
D02/03/2026
PSalary
T1000.00
^`;

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

function renderDialog(content = QIF) {
  const onOpenChange = vi.fn();
  render(
    <ImportDialog
      open
      onOpenChange={onOpenChange}
      accountId={1}
      qifContent={content}
      filename="statement.qif"
    />,
  );
  return { onOpenChange };
}

beforeEach(() => {
  create.mutateAsync.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe("ImportDialog (phone)", () => {
  beforeEach(() => setViewport(true));

  it("opens as an expanded drawer without focusing a control", async () => {
    renderDialog();
    expect(await screen.findByText("Import — statement.qif")).toBeTruthy();
    const popup = document.querySelector('[data-slot="drawer-popup"]');
    expect(popup).toBeTruthy();
    expect(popup?.getAttribute("data-size")).toBe("expanded");
    await act(async () => {});
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect(document.activeElement?.tagName).not.toBe("BUTTON");
  });

  it("lists transactions as tappable cards, not a table", async () => {
    renderDialog();
    await screen.findByText("Import — statement.qif");
    expect(screen.queryByRole("table")).toBeNull();
    const coffee = screen.getByRole("checkbox", { name: /Coffee Shop/ });
    expect((coffee as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByText("New")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Import 2 transactions" }),
    ).toBeTruthy();
  });

  it("asks before discarding an edited selection", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(await screen.findByRole("checkbox", { name: /Coffee/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Discard import?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes an untouched review immediately", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog and shows an error when an import fails midway", async () => {
    create.mutateAsync
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Disk full"));
    const { onOpenChange } = renderDialog();
    fireEvent.click(
      await screen.findByRole("button", { name: "Import 2 transactions" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Import stopped after 1 of 2: Disk full",
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("imports once on a double tap and closes", async () => {
    let release: () => void = () => {};
    create.mutateAsync.mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const { onOpenChange } = renderDialog();
    const button = await screen.findByRole("button", {
      name: "Import 2 transactions",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(create.mutateAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Importing...")).toBeTruthy();
    await act(async () => {
      release();
    });
    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(2));
    await act(async () => {
      release();
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(create.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("reports a mismatched account type", async () => {
    renderDialog("!Type:CCard\nD01/03/2026\nPShop\nT5\n^");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "QIF file is type Credit Card but this is a Bank account",
    );
    expect(screen.getByText("No transactions found in file.")).toBeTruthy();
  });
});

describe("ImportDialog (desktop)", () => {
  beforeEach(() => setViewport(false));

  it("keeps the review table in a dialog", async () => {
    renderDialog();
    await screen.findByText("Import — statement.qif");
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Withdrawal")).toBeTruthy();
    expect(screen.getByText("Deposit")).toBeTruthy();
  });
});
