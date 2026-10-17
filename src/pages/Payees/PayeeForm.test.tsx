import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payee } from "@/types/electron";
import { PayeeForm } from "./PayeeForm";

const create = { mutateAsync: vi.fn(), isPending: false };
const update = { mutateAsync: vi.fn(), isPending: false };

const payees = [
  { id: 7, name: "Starbucks", categoryId: 3, amount: -4.5 },
] as unknown as Payee[];

vi.mock("@/hooks/usePayees", () => ({
  usePayees: () => ({ payees, create, update }),
}));

vi.mock("@/components/CategoryCombobox", () => ({
  CategoryCombobox: ({ value }: { value: string }) => (
    <div>Category {value || "none"}</div>
  ),
}));

beforeEach(() => {
  create.mutateAsync.mockReset().mockResolvedValue([]);
  update.mutateAsync.mockReset().mockResolvedValue([]);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderForm(editingId: number | null) {
  const onOpenChange = vi.fn();
  render(<PayeeForm open onOpenChange={onOpenChange} editingId={editingId} />);
  return { onOpenChange };
}

describe("PayeeForm", () => {
  it("opens as a drawer on phones without focusing an input", async () => {
    renderForm(7);
    await act(async () => {});
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeTruthy();
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Starbucks",
    );
    expect(
      (screen.getByLabelText("Default withdrawal") as HTMLInputElement).value,
    ).toBe("4.50");
  });

  it("saves the unchanged update payload", async () => {
    const { onOpenChange } = renderForm(7);
    fireEvent.change(screen.getByLabelText("Default withdrawal"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(update.mutateAsync).toHaveBeenCalledWith({
      id: 7,
      data: { name: "Starbucks", categoryId: 3, amount: -5 },
    });
  });

  it("asks before discarding an edited draft", () => {
    const { onOpenChange } = renderForm(7);
    fireEvent.change(screen.getByLabelText("Default deposit"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes a clean form immediately", () => {
    const { onOpenChange } = renderForm(7);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the draft and shows an error when saving fails", async () => {
    create.mutateAsync.mockRejectedValueOnce(new Error("Offline"));
    const { onOpenChange } = renderForm(null);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Bakery" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Couldn't save the payee. Offline",
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Bakery",
    );
  });

  it("ignores a second submit while a save is in flight", async () => {
    let resolve: (v: unknown) => void = () => {};
    create.mutateAsync.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { onOpenChange } = renderForm(null);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Bakery" },
    });
    const save = screen.getByRole("button", { name: "Create" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(create.mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => resolve([]));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
