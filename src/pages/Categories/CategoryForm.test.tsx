import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/types/electron";
import { CategorySheet } from "./CategoryForm";

const create = { mutateAsync: vi.fn(), isPending: false };
const update = { mutateAsync: vi.fn(), isPending: false };

const categories = [
  { id: 1, name: "Groceries", expenseType: "expense", parentId: null },
  { id: 2, name: "Snacks", expenseType: "expense", parentId: 1 },
] as unknown as Category[];

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ categories, create, update }),
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

function renderForm(props: { editingId: number | null; parentId?: number }) {
  const onOpenChange = vi.fn();
  render(<CategorySheet open onOpenChange={onOpenChange} {...props} />);
  return { onOpenChange };
}

describe("CategorySheet", () => {
  it("opens as a drawer on phones without focusing an input", async () => {
    renderForm({ editingId: 2 });
    await act(async () => {});
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeTruthy();
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Snacks",
    );
  });

  it("shows the parent for a new sub-category and saves with it", async () => {
    const { onOpenChange } = renderForm({ editingId: null, parentId: 1 });
    expect(screen.getByText("New Sub-category")).toBeTruthy();
    expect(screen.getByText("Parent category")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Fruit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(create.mutateAsync).toHaveBeenCalledWith({
      name: "Fruit",
      expenseType: "expense",
      parentId: 1,
    });
  });

  it("disables Create until a name is entered", () => {
    renderForm({ editingId: null });
    expect(
      (screen.getByRole("button", { name: "Create" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("closes a clean form immediately and asks before discarding a draft", () => {
    const { onOpenChange } = renderForm({ editingId: 1 });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Food" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes immediately when nothing changed", () => {
    const { onOpenChange } = renderForm({ editingId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });

  it("keeps the draft and shows an error when saving fails", async () => {
    update.mutateAsync.mockRejectedValueOnce(new Error("Disk full"));
    const { onOpenChange } = renderForm({ editingId: 1 });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Food" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Couldn't save the category. Disk full",
      ),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Food",
    );
  });

  it("ignores a second submit while a save is in flight", async () => {
    let resolve: (v: unknown) => void = () => {};
    update.mutateAsync.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { onOpenChange } = renderForm({ editingId: 1 });
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Food" },
    });
    const save = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(update.mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => resolve([]));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
