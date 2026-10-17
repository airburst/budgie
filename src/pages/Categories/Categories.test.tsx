import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category } from "@/types/electron";
import Categories from "./Categories";

const remove = { mutate: vi.fn() };

const categories = [
  { id: 1, name: "Groceries", expenseType: "expense", parentId: null },
  { id: 2, name: "Snacks", expenseType: "expense", parentId: 1 },
  { id: 3, name: "Salary", expenseType: "income", parentId: null },
  { id: 4, name: "Transfer", expenseType: "transfer", parentId: null },
] as unknown as Category[];

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ categories, remove }),
}));

vi.mock("../layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./CategoryForm", () => ({
  CategorySheet: ({
    open,
    editingId,
    parentId,
  }: {
    open: boolean;
    editingId: number | null;
    parentId?: number | null;
  }) =>
    open ? (
      <div>
        Category form edit={String(editingId)} parent={String(parentId)}
      </div>
    ) : null,
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
  remove.mutate.mockReset();
  setViewport(true);
});

afterEach(() => vi.unstubAllGlobals());

const cards = () => screen.getAllByRole("listitem");

describe("Categories", () => {
  it("keeps parent/child order with visible parent context, hiding transfer", () => {
    render(<Categories />);

    expect(cards().map((c) => c.getAttribute("data-child"))).toEqual([
      null,
      "true",
      null,
    ]);
    expect(within(cards()[0]!).getByText("Groceries")).toBeTruthy();
    expect(within(cards()[0]!).getAllByText(/1 sub-category/).length).toBe(2);
    const child = cards()[1]!;
    expect(within(child).getAllByText(/Sub-category of Groceries/).length).toBe(
      2,
    );
    expect(child.textContent).toContain("expense");
    expect(cards()[2]!.textContent).toContain("income");
    expect(screen.queryByText("Transfer")).toBeNull();
  });

  it("opens read-only details on card tap, with an explicit Edit", () => {
    render(<Categories />);

    fireEvent.click(screen.getByRole("button", { name: "Snacks" }));
    expect(screen.getByText("Category details")).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Groceries")).toBeTruthy();
    expect(within(dialog).queryByRole("textbox")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Category form edit=2 parent=null")).toBeTruthy();
  });

  it("offers Add sub-category on parents only and Edit on all", () => {
    render(<Categories />);

    expect(
      screen.getByRole("button", { name: "Add sub-category to Groceries" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add sub-category to Snacks" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Add sub-category to Salary" }),
    );
    expect(screen.getByText("Category form edit=null parent=3")).toBeTruthy();
  });

  it("blocks deleting a parent that has children", () => {
    render(<Categories />);
    expect(
      (
        screen.getByRole("button", {
          name: "Delete Groceries",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Delete Snacks" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("confirms before deleting and Cancel deletes nothing", () => {
    render(<Categories />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Snacks" }));
    expect(screen.getByText("Delete category?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(remove.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete Snacks" }));
    fireEvent.click(
      within(screen.getByText("Delete category?").closest("[role=dialog]")!)
        .getAllByRole("button", { name: "Delete" })
        .at(-1)!,
    );
    expect(remove.mutate).toHaveBeenCalledWith(2);
  });

  it("keeps the parent visible when only a child matches the search", () => {
    render(<Categories />);
    fireEvent.change(screen.getByPlaceholderText("Search categories…"), {
      target: { value: "snack" },
    });
    expect(cards()).toHaveLength(2);
    expect(cards()[0]!.textContent).toContain("Groceries");
    expect(cards()[1]!.textContent).toContain("Snacks");
  });
});
