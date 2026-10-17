import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, Envelope, EnvelopeCategory } from "@/types/electron";
import { EnvelopeFormDialog } from "./EnvelopeFormDialog";

const create = { mutateAsync: vi.fn(), isPending: false };
const update = { mutateAsync: vi.fn(), isPending: false };
const remove = { mutateAsync: vi.fn(), isPending: false };
const createMapping = { mutateAsync: vi.fn() };
const removeByEnvelope = { mutateAsync: vi.fn() };

vi.mock("@/hooks/useEnvelopes", () => ({
  useEnvelopes: () => ({ create, update, remove }),
}));
vi.mock("@/hooks/useEnvelopeCategories", () => ({
  useEnvelopeCategories: () => ({
    create: createMapping,
    removeByEnvelope,
  }),
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
  create.mutateAsync.mockReset().mockResolvedValue([{ id: 9 }]);
  update.mutateAsync.mockReset().mockResolvedValue([]);
  remove.mutateAsync.mockReset().mockResolvedValue([]);
  createMapping.mutateAsync.mockReset().mockResolvedValue([]);
  removeByEnvelope.mutateAsync.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

const categories = [
  { id: 1, name: "Food", expenseType: "expense", deleted: false, parentId: null },
  { id: 2, name: "Supermarket", expenseType: "expense", deleted: false, parentId: 1 },
  { id: 3, name: "Takeaway", expenseType: "expense", deleted: false, parentId: 1 },
  { id: 4, name: "Rent", expenseType: "expense", deleted: false, parentId: null },
  { id: 5, name: "Salary", expenseType: "income", deleted: false, parentId: null },
] as unknown as Category[];
const mappings = [
  { id: 1, envelopeId: 7, categoryId: 2 },
  { id: 2, envelopeId: 8, categoryId: 4 },
] as unknown as EnvelopeCategory[];
const envelope = {
  id: 7,
  name: "Groceries",
  active: true,
  sortOrder: 0,
} as unknown as Envelope;

function renderForm(editing: boolean) {
  const onOpenChange = vi.fn();
  render(
    <EnvelopeFormDialog
      open
      onOpenChange={onOpenChange}
      categories={categories}
      allMappings={mappings}
      envelope={editing ? envelope : null}
    />,
  );
  return { onOpenChange };
}

describe("EnvelopeFormDialog", () => {
  it("opens on phones without focusing an input", async () => {
    renderForm(true);
    await act(async () => {});
    expect(document.activeElement?.tagName).not.toBe("INPUT");
  });

  it("retains existing category mappings and disables ones mapped elsewhere", () => {
    renderForm(true);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Groceries",
    );
    expect((screen.getByLabelText("Supermarket") as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByLabelText("Takeaway") as HTMLInputElement).checked).toBe(
      false,
    );
    expect(
      (screen.getByLabelText(/^Rent/) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.queryByLabelText("Salary")).toBeNull();
  });

  it("saves name and mappings with the existing call sequence", async () => {
    const { onOpenChange } = renderForm(true);
    fireEvent.click(screen.getByLabelText("Takeaway"));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Food shop" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect(update.mutateAsync).toHaveBeenCalledWith({
      id: 7,
      data: { name: "Food shop" },
    });
    expect(removeByEnvelope.mutateAsync).toHaveBeenCalledWith(7);
    expect(createMapping.mutateAsync.mock.calls.map((c) => c[0])).toEqual([
      { envelopeId: 7, categoryId: 2 },
      { envelopeId: 7, categoryId: 3 },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("creates a new envelope with its mappings", async () => {
    const { onOpenChange } = renderForm(false);
    expect(
      (screen.getByRole("button", { name: "Create" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Fun" },
    });
    fireEvent.click(screen.getByLabelText("Takeaway"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });
    expect(create.mutateAsync).toHaveBeenCalledWith({
      name: "Fun",
      active: true,
      sortOrder: 0,
    });
    expect(createMapping.mutateAsync).toHaveBeenCalledWith({
      envelopeId: 9,
      categoryId: 3,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ignores a second submit while saving", async () => {
    let resolve!: (v: unknown) => void;
    update.mutateAsync.mockReturnValue(new Promise((r) => (resolve = r)));
    renderForm(true);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Food shop" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.submit(screen.getByLabelText("Name").closest("form")!);
    expect(update.mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => resolve([]));
  });

  it("keeps the form and draft with an inline error when saving fails", async () => {
    update.mutateAsync.mockRejectedValue(new Error("disk full"));
    const { onOpenChange } = renderForm(true);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Food shop" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't save the envelope.",
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Food shop",
    );
  });

  it("asks before discarding a dirty draft but not a clean one", async () => {
    const { onOpenChange } = renderForm(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    fireEvent.click(screen.getByLabelText("Takeaway"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(await screen.findByText("Discard changes?")).toBeTruthy();
    const discard = screen
      .getAllByRole("button", { name: "Discard" })
      .at(-1)!;
    fireEvent.click(discard);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("deletes only after a confirmation that focuses Cancel", async () => {
    const { onOpenChange } = renderForm(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete envelope?")).toBeTruthy();
    expect(remove.mutateAsync).not.toHaveBeenCalled();
    await waitFor(() => {
      const cancels = screen.getAllByRole("button", { name: "Cancel" });
      expect(cancels).toContain(document.activeElement);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete envelope" }));
    });
    expect(removeByEnvelope.mutateAsync).toHaveBeenCalledWith(7);
    expect(remove.mutateAsync).toHaveBeenCalledWith(7);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers no delete when creating", () => {
    renderForm(false);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});
