import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Payee } from "@/types/electron";
import Payees from "./Payees";

const remove = { mutate: vi.fn() };

const payees = [
  { id: 2, name: "Wages Ltd", categoryId: 9, amount: 1500 },
  { id: 1, name: "Corner Shop", categoryId: 8, amount: -12.5 },
  { id: 3, name: "Mystery", categoryId: null, amount: null },
] as unknown as Payee[];

vi.mock("@/hooks/usePayees", () => ({
  usePayees: () => ({ payees, remove }),
}));

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    categories: [
      { id: 8, name: "Groceries" },
      { id: 9, name: "Salary" },
    ],
  }),
}));

vi.mock("../layout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./PayeeForm", () => ({
  PayeeForm: ({
    open,
    editingId,
  }: {
    open: boolean;
    editingId: number | null;
  }) => (open ? <div>Payee form edit={String(editingId)}</div> : null),
}));

beforeEach(() => {
  remove.mutate.mockReset();
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => vi.unstubAllGlobals());

const cards = () => screen.getAllByRole("listitem");

describe("Payees", () => {
  it("lists payees by name with default category and amount", () => {
    render(<Payees />);

    expect(cards().map((c) => c.querySelector("button")?.textContent)).toEqual([
      "Corner Shop",
      "Mystery",
      "Wages Ltd",
    ]);
    expect(cards()[0]!.textContent).toContain("Groceries");
    expect(cards()[0]!.textContent).toContain("−12.50");
    expect(cards()[1]!.textContent).toContain("No default category");
    expect(cards()[2]!.textContent).toContain("+1500.00");
  });

  it("opens read-only details on card tap, with an explicit Edit", () => {
    render(<Payees />);

    fireEvent.click(screen.getByRole("button", { name: "Corner Shop" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Payee details")).toBeTruthy();
    expect(within(dialog).getByText("Groceries")).toBeTruthy();
    expect(within(dialog).queryByRole("textbox")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Payee form edit=1")).toBeTruthy();
  });

  it("edits from a labelled action without opening details", () => {
    render(<Payees />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Wages Ltd" }));
    expect(screen.getByText("Payee form edit=2")).toBeTruthy();
    expect(screen.queryByText("Payee details")).toBeNull();
  });

  it("confirms before deleting and Cancel deletes nothing", () => {
    render(<Payees />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Mystery" }));
    expect(screen.getByText("Delete payee?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(remove.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete Mystery" }));
    fireEvent.click(
      within(screen.getByText("Delete payee?").closest("[role=dialog]")!)
        .getAllByRole("button", { name: "Delete" })
        .at(-1)!,
    );
    expect(remove.mutate).toHaveBeenCalledWith(3);
  });

  it("shows distinct empty states", () => {
    render(<Payees />);
    fireEvent.change(screen.getByPlaceholderText("Search payees…"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No payees match your search.")).toBeTruthy();
  });
});
