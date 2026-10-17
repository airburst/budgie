import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "@/types/electron";
import { AccountForm } from "./AccountForm";

const create = { mutateAsync: vi.fn(), isPending: false };
const update = { mutateAsync: vi.fn(), isPending: false };
const remove = { mutateAsync: vi.fn(), isPending: false };

vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ create, update, remove }),
}));

beforeEach(() => {
  create.mutateAsync.mockReset().mockResolvedValue([]);
  update.mutateAsync.mockReset().mockResolvedValue([]);
  remove.mutateAsync.mockReset().mockResolvedValue(undefined);
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

const account = {
  id: 4,
  name: "Savings",
  number: "1234",
  type: "bank",
  balance: 10,
  currency: "GBP",
  notes: null,
  interestRate: null,
  creditLimit: null,
} as unknown as Account;

function renderForm(editing = true) {
  const onOpenChange = vi.fn();
  render(
    <AccountForm
      open
      onOpenChange={onOpenChange}
      editingId={editing ? account.id : null}
      account={editing ? account : null}
    />,
  );
  return { onOpenChange };
}

describe("AccountForm", () => {
  it("opens on phones without focusing an input", async () => {
    renderForm();
    await act(async () => {});
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Savings",
    );
  });

  it("closes a clean form immediately on Escape", () => {
    const { onOpenChange } = renderForm();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks before discarding an edited draft", () => {
    const { onOpenChange } = renderForm();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rainy day" },
    });
    fireEvent.keyDown(screen.getByLabelText("Name"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the draft and shows an error when saving fails", async () => {
    update.mutateAsync.mockRejectedValueOnce(new Error("Disk full"));
    const { onOpenChange } = renderForm();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rainy day" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Couldn't save the account. Disk full",
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Rainy day",
    );
  });

  it("saves the unchanged update payload", async () => {
    const { onOpenChange } = renderForm();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Rainy day" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(update.mutateAsync).toHaveBeenCalledWith({
      id: 4,
      data: {
        name: "Rainy day",
        number: "1234",
        notes: null,
        interestRate: null,
        creditLimit: null,
      },
    });
  });
});
