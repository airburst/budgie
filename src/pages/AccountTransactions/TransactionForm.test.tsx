import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionForm } from "./TransactionForm";

const update = { mutateAsync: vi.fn(), isPending: false };
const create = { mutateAsync: vi.fn(), isPending: false };

const transactions = [
  {
    id: 1,
    accountId: 1,
    date: "2026-03-01",
    payee: "Supermarket",
    amount: -42.8,
    categoryId: 7,
    notes: "Weekly shop",
    cleared: true,
    reconciled: false,
    transferTransactionId: null,
  },
  {
    id: 2,
    accountId: 1,
    date: "2026-02-01",
    payee: "Rent",
    amount: -900,
    categoryId: null,
    notes: null,
    cleared: true,
    reconciled: true,
    transferTransactionId: null,
  },
];

vi.mock("@/hooks/useTransactions", () => ({
  useTransactions: () => ({
    transactions,
    categories: [{ id: 7, name: "Groceries" }],
    create,
    update,
  }),
}));
vi.mock("@/hooks/usePayees", () => ({
  usePayees: () => ({ upsert: { mutate: vi.fn() } }),
}));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ preferences: { autofillPayees: true } }),
}));
vi.mock("@/components/PayeeCombobox", () => ({
  PayeeCombobox: (props: {
    value: string;
    onValueChange: (v: string) => void;
    autoFocus?: boolean;
  }) => (
    <input
      aria-label="Payee"
      value={props.value}
      autoFocus={props.autoFocus}
      onChange={(e) => props.onValueChange(e.target.value)}
    />
  ),
}));
vi.mock("@/components/CategoryCombobox", () => ({
  CategoryCombobox: () => <input aria-label="Category" />,
}));

const viewport = {
  desktop: false,
  listeners: new Set<() => void>(),
};

function setViewport(desktop: boolean) {
  viewport.desktop = desktop;
  act(() => viewport.listeners.forEach((l) => l()));
}

beforeEach(() => {
  viewport.desktop = false;
  viewport.listeners.clear();
  update.mutateAsync.mockReset().mockResolvedValue([]);
  create.mutateAsync.mockReset().mockResolvedValue([]);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return viewport.desktop;
      },
      addEventListener: (_: string, l: () => void) => viewport.listeners.add(l),
      removeEventListener: (_: string, l: () => void) =>
        viewport.listeners.delete(l),
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderForm(
  props: Partial<ComponentProps<typeof TransactionForm>> = {},
) {
  const onOpenChange = vi.fn();
  const view = render(
    <TransactionForm
      open
      onOpenChange={onOpenChange}
      editingId={1}
      accountId={1}
      account={
        {
          id: 1,
          name: "Current Account",
          type: "checking",
        } as ComponentProps<typeof TransactionForm>["account"]
      }
      initialMode="details"
      {...props}
    />,
  );
  return { onOpenChange, ...view };
}

describe("TransactionForm responsive overlay (phone)", () => {
  it("opens read-only details in a drawer without focusing an input", async () => {
    renderForm();
    await screen.findByText("Transaction Details");
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeTruthy();
    expect(screen.getByText("Supermarket")).toBeTruthy();
    expect(screen.getByText("Groceries")).toBeTruthy();
    expect(screen.getByText("Current Account · Cleared")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });

  it("enters edit explicitly without autofocusing a field", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Edit Transaction")).toBeTruthy();
    expect((screen.getByLabelText("Payee") as HTMLInputElement).value).toBe(
      "Supermarket",
    );
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect(
      document.querySelector(
        '[data-slot="drawer-popup"][data-size="expanded"]',
      ),
    ).toBeTruthy();
  });

  it("keeps reconciled transactions read-only", async () => {
    renderForm({ editingId: 2 });
    await screen.findByText("Rent");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByText(/can't be edited/)).toBeTruthy();
  });

  it("asks before an implicit dismissal discards a dirty draft", async () => {
    const { onOpenChange } = renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Changed" },
    });
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(await screen.findByText("Discard changes?")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("Cancel on a dirty draft confirms, then returns to unchanged details", async () => {
    const { onOpenChange } = renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Changed" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(await screen.findByText("Transaction Details")).toBeTruthy();
    expect(screen.getByText("Weekly shop")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("clean Cancel returns to details without confirmation", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Transaction Details")).toBeTruthy();
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });

  it("keeps the draft and shows an error when saving fails", async () => {
    update.mutateAsync.mockRejectedValueOnce(new Error("Disk full"));
    const { onOpenChange } = renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Keep me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Disk full",
    );
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Keep me",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("submits once when Save is pressed repeatedly", async () => {
    let resolve: (v: unknown) => void = () => {};
    update.mutateAsync.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { onOpenChange } = renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const saveButton = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    await act(async () => resolve([]));
    expect(update.mutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("preserves the draft when the viewport crosses to desktop", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Rotated draft" },
    });
    setViewport(true);
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="dialog-content"]'),
      ).toBeTruthy(),
    );
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Rotated draft",
    );
    expect(screen.getByText("Edit Transaction")).toBeTruthy();
  });
});

describe("TransactionForm responsive overlay (desktop)", () => {
  it("opens new transactions in a centered dialog editor", async () => {
    viewport.desktop = true;
    renderForm({ editingId: null, initialMode: "edit" });
    expect(
      await screen.findByText("Add Transaction", { selector: "h2" }),
    ).toBeTruthy();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull();
  });
});
