import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduledPaymentDialog } from "./ScheduledPaymentForm";

const update = { mutateAsync: vi.fn(), isPending: false };
const create = { mutateAsync: vi.fn(), isPending: false };

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
    autoPost: true,
    daysInAdvance: 2,
    notes: "Family plan",
    active: false,
  },
];

vi.mock("@/hooks/useScheduledTransactions", () => ({
  useScheduledTransactions: () => ({
    scheduled,
    accounts: [{ id: 1, name: "Current Account" }],
    categories: [{ id: 7, name: "Entertainment", expenseType: "expense" }],
    create,
    update,
  }),
}));
vi.mock("@/hooks/usePayees", () => ({
  usePayees: () => ({ upsert: { mutate: vi.fn() } }),
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
  props: Partial<ComponentProps<typeof ScheduledPaymentDialog>> = {},
) {
  const onOpenChange = vi.fn();
  const onRecord = vi.fn();
  const view = render(
    <ScheduledPaymentDialog
      open
      onOpenChange={onOpenChange}
      editingId={1}
      initialMode="details"
      onRecord={onRecord}
      {...props}
    />,
  );
  return { onOpenChange, onRecord, ...view };
}

describe("ScheduledPaymentDialog (phone)", () => {
  it("opens read-only details in a drawer with no input focused", async () => {
    renderForm();
    await screen.findByText("Scheduled Payment Details");
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeTruthy();
    expect(screen.getByText("Netflix")).toBeTruthy();
    expect(screen.getByText("Monthly")).toBeTruthy();
    expect(screen.getByText("Entertainment")).toBeTruthy();
    expect(screen.getByText("Family plan")).toBeTruthy();
    expect(
      screen.getByText(/Current Account · Paused · Auto-post/),
    ).toBeTruthy();
    expect(screen.getByText(/This schedule is paused/)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });

  it("Record payment is an explicit action and records nothing itself", async () => {
    const { onRecord } = renderForm();
    fireEvent.click(
      await screen.findByRole("button", { name: "Record payment" }),
    );
    expect(onRecord).toHaveBeenCalledWith(1);
    expect(create.mutateAsync).not.toHaveBeenCalled();
    expect(update.mutateAsync).not.toHaveBeenCalled();
  });

  it("enters edit explicitly in an expanded drawer without autofocus", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Edit Scheduled Payment")).toBeTruthy();
    expect((screen.getByLabelText("Payee") as HTMLInputElement).value).toBe(
      "Netflix",
    );
    expect(screen.getByText("Recurrence Rules")).toBeTruthy();
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect(
      document.querySelector(
        '[data-slot="drawer-popup"][data-size="expanded"]',
      ),
    ).toBeTruthy();
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
    expect(await screen.findByText("Scheduled Payment Details")).toBeTruthy();
    expect(screen.getByText("Family plan")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("clean Cancel returns to details without confirmation", async () => {
    renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Scheduled Payment Details")).toBeTruthy();
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });

  it("shows inline validation errors instead of silently disabling Save", async () => {
    renderForm({ editingId: null, initialMode: "edit" });
    fireEvent.click(
      await screen.findByRole("button", { name: "Add Schedule" }),
    );
    expect(await screen.findByText("Payee is required.")).toBeTruthy();
    expect(screen.getByText("Choose an account.")).toBeTruthy();
    expect(
      screen.getByText("Enter a withdrawal or deposit amount."),
    ).toBeTruthy();
    expect(create.mutateAsync).not.toHaveBeenCalled();
  });

  it("keeps the draft and shows an error when saving fails", async () => {
    update.mutateAsync.mockRejectedValueOnce(new Error("Disk full"));
    const { onOpenChange } = renderForm();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Keep me" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Schedule" }));
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
    const saveButton = screen.getByRole("button", { name: "Save Schedule" });
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
  });
});

describe("ScheduledPaymentDialog (desktop)", () => {
  it("opens new schedules in a centered dialog editor", async () => {
    viewport.desktop = true;
    renderForm({ editingId: null, initialMode: "edit" });
    expect(
      await screen.findByText("Add Scheduled Payment", { selector: "h2" }),
    ).toBeTruthy();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeNull();
  });
});
