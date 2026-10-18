import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

const api = {
  createTransaction: vi.fn(),
  updateScheduledTransaction: vi.fn(),
  deleteScheduledTransaction: vi.fn(),
};

const scheduled = [
  {
    id: 1,
    accountId: 1,
    categoryId: 7,
    transferToAccountId: null,
    payee: "Netflix",
    amount: -12.99,
    rrule: "FREQ=MONTHLY;BYMONTHDAY=20",
    nextDueDate: "2030-03-20",
    autoPost: false,
    daysInAdvance: null,
    notes: "Family plan",
    active: true,
  },
  {
    id: 2,
    accountId: 1,
    categoryId: null,
    transferToAccountId: null,
    payee: "Once only",
    amount: -50,
    rrule: "FREQ=DAILY;COUNT=1",
    nextDueDate: "2030-03-20",
    autoPost: false,
    daysInAdvance: null,
    notes: null,
    active: true,
  },
];

vi.mock("@/hooks/useScheduledTransactions", () => ({
  useScheduledTransactions: () => ({
    scheduled,
    accounts: [{ id: 1, name: "Current Account" }],
    categories: [{ id: 7, name: "Entertainment" }],
  }),
}));
vi.mock("@/components/CategoryCombobox", () => ({
  CategoryCombobox: () => <input aria-label="Category" />,
}));

const viewport = {
  desktop: false,
  listeners: new Set<() => void>(),
};

beforeEach(() => {
  viewport.desktop = false;
  viewport.listeners.clear();
  api.createTransaction.mockReset().mockResolvedValue({});
  api.updateScheduledTransaction.mockReset().mockResolvedValue({});
  api.deleteScheduledTransaction.mockReset().mockResolvedValue({});
  (window as unknown as { api: unknown }).api = api;
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

function renderDialog(
  props: Partial<ComponentProps<typeof RecordPaymentDialog>> = {},
) {
  const onOpenChange = vi.fn();
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <RecordPaymentDialog
        open
        onOpenChange={onOpenChange}
        scheduledId={1}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe("RecordPaymentDialog (phone)", () => {
  it("opens a read-only confirmation first and records nothing", async () => {
    renderDialog();
    await screen.findByText("Nothing is recorded until you confirm.");
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByText("-£12.99")).toBeTruthy();
    expect(screen.getByText("Current Account")).toBeTruthy();
    expect(screen.getByText("Entertainment")).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect(api.createTransaction).not.toHaveBeenCalled();
  });

  it("records the scheduled amount only from the explicit confirm button", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(
      await screen.findByRole("button", { name: "Record payment" }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.createTransaction).toHaveBeenCalledTimes(1);
    expect(api.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 1,
        categoryId: 7,
        payee: "Netflix",
        amount: -12.99,
        cleared: false,
      }),
    );
    expect(api.updateScheduledTransaction).toHaveBeenCalledWith(1, {
      nextDueDate: "2030-04-20",
    });
  });

  it("Change amount opens editing without autofocus and records the edit", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(
      await screen.findByRole("button", { name: "Change amount" }),
    );
    const withdrawal = (await screen.findByLabelText(
      "Withdrawal",
    )) as HTMLInputElement;
    expect(withdrawal.value).toBe("12.99");
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect(
      document.querySelector(
        '[data-slot="drawer-popup"][data-size="expanded"]',
      ),
    ).toBeTruthy();

    fireEvent.change(withdrawal, { target: { value: "15.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: -15 }),
    );
  });

  it("confirms before discarding an edited amount, then returns to the confirmation", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(
      await screen.findByRole("button", { name: "Change amount" }),
    );
    fireEvent.change(await screen.findByLabelText("Withdrawal"), {
      target: { value: "99.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(
      await screen.findByText("Nothing is recorded until you confirm."),
    ).toBeTruthy();
    expect(screen.getByText("-£12.99")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(api.createTransaction).not.toHaveBeenCalled();
  });

  it("Skip advances the schedule without creating a transaction", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.createTransaction).not.toHaveBeenCalled();
    expect(api.updateScheduledTransaction).toHaveBeenCalledWith(1, {
      nextDueDate: "2030-04-20",
    });
  });

  it("keeps the surface open with an alert when recording fails", async () => {
    api.createTransaction.mockRejectedValueOnce(new Error("Disk full"));
    const { onOpenChange } = renderDialog();
    fireEvent.click(
      await screen.findByRole("button", { name: "Record payment" }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Disk full",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(api.updateScheduledTransaction).not.toHaveBeenCalled();
  });

  it("records once when Record payment is pressed repeatedly", async () => {
    let resolve: (v: unknown) => void = () => {};
    api.createTransaction.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderDialog();
    const button = await screen.findByRole("button", {
      name: "Record payment",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => resolve({}));
    expect(api.createTransaction).toHaveBeenCalledTimes(1);
  });

  it("warns when recording would remove a one-off schedule", async () => {
    renderDialog({ scheduledId: 2 });
    expect(await screen.findByText(/last occurrence/)).toBeTruthy();
  });
});

describe("RecordPaymentDialog (desktop)", () => {
  it("opens the editable form directly in a dialog", async () => {
    viewport.desktop = true;
    renderDialog();
    expect(await screen.findByLabelText("Withdrawal")).toBeTruthy();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Change amount" })).toBeNull();
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });
});
