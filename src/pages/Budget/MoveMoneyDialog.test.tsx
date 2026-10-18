import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Envelope } from "@/types/electron";
import { MoveMoneyDialog } from "./MoveMoneyDialog";

const create = { mutateAsync: vi.fn() };
vi.mock("@/hooks/useBudgetTransfers", () => ({
  useBudgetTransfers: () => ({ transfers: [], create }),
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

beforeEach(() => {
  setViewport(true);
  create.mutateAsync.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

const envelopes = [
  { id: 1, name: "Groceries" },
  { id: 2, name: "Rent" },
] as unknown as Envelope[];

function renderDialog() {
  const onOpenChange = vi.fn();
  render(
    <MoveMoneyDialog
      open
      onOpenChange={onOpenChange}
      month="2026-03"
      envelopes={envelopes}
    />,
  );
  return { onOpenChange };
}

async function choose(label: string, option: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("MoveMoneyDialog", () => {
  it("is a drawer on phones with From, To and Amount and no autofocus", async () => {
    renderDialog();
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeTruthy();
    await act(async () => {});
    expect(screen.getByRole("combobox", { name: "From" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "To" })).toBeTruthy();
    expect(screen.getByLabelText("Amount (£)")).toBeTruthy();
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });

  it("only enables Move for two different envelopes and a positive amount", async () => {
    renderDialog();
    const move = () =>
      screen.getByRole("button", { name: "Move" }) as HTMLButtonElement;
    expect(move().disabled).toBe(true);
    await choose("From", "Groceries");
    await choose("To", "Groceries");
    fireEvent.change(screen.getByLabelText("Amount (£)"), {
      target: { value: "20" },
    });
    expect(move().disabled).toBe(true);
    expect(screen.getByText("Choose two different envelopes.")).toBeTruthy();
    await choose("To", "Rent");
    expect(move().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Amount (£)"), {
      target: { value: "0" },
    });
    expect(move().disabled).toBe(true);
  });

  it("submits the existing transfer payload once and closes", async () => {
    const { onOpenChange } = renderDialog();
    await choose("From", "Groceries");
    await choose("To", "Rent");
    fireEvent.change(screen.getByLabelText("Amount (£)"), {
      target: { value: "12.5" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move" }));
      fireEvent.submit(screen.getByLabelText("Amount (£)").closest("form")!);
    });
    expect(create.mutateAsync).toHaveBeenCalledTimes(1);
    expect(create.mutateAsync).toHaveBeenCalledWith({
      fromEnvelopeId: 1,
      toEnvelopeId: 2,
      month: "2026-03",
      amount: 12.5,
      notes: null,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the drawer and values with an inline error on failure", async () => {
    create.mutateAsync.mockRejectedValue(new Error("nope"));
    const { onOpenChange } = renderDialog();
    await choose("From", "Groceries");
    await choose("To", "Rent");
    fireEvent.change(screen.getByLabelText("Amount (£)"), {
      target: { value: "5" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move" }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't move the money.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Amount (£)") as HTMLInputElement).value).toBe(
      "5",
    );
  });

  it("closes a clean drawer immediately and confirms before discarding input", async () => {
    const { onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    fireEvent.change(screen.getByLabelText("Amount (£)"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(await screen.findByText("Discard changes?")).toBeTruthy();
  });
});
