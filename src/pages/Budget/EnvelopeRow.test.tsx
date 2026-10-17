import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvelopeRow } from "./EnvelopeRow";

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

afterEach(() => vi.unstubAllGlobals());

function renderRow(
  props: Partial<Parameters<typeof EnvelopeRow>[0]> = {},
) {
  const onAssignedChange = vi.fn().mockResolvedValue([]);
  const utils = render(
    <DndContext>
      <SortableContext items={[1]}>
        <ul>
          <EnvelopeRow
            envelopeId={1}
            name="Groceries"
            assigned={400}
            activity={-150}
            available={250}
            underfunded={false}
            categoryNames={["Supermarket", "Markets"]}
            index={0}
            count={1}
            onAssignedChange={onAssignedChange}
            onEdit={vi.fn()}
            onMove={vi.fn()}
            {...props}
          />
        </ul>
      </SortableContext>
    </DndContext>,
  );
  return { onAssignedChange, ...utils };
}

const editButton = () =>
  screen.getByRole("button", { name: /^Edit assigned amount for Groceries/ });

describe("EnvelopeRow on phones", () => {
  it("only the explicit control starts editing, not the card", () => {
    setViewport(true);
    renderRow();
    fireEvent.click(screen.getByText("Groceries"));
    fireEvent.click(screen.getByRole("listitem"));
    expect(screen.queryByRole("spinbutton")).toBeNull();
    fireEvent.click(editButton());
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });

  it("does not autofocus the input and does not save on blur", async () => {
    setViewport(true);
    const { onAssignedChange } = renderRow();
    fireEvent.click(editButton());
    const input = screen.getByLabelText(
      "Assigned amount for Groceries",
    ) as HTMLInputElement;
    expect(document.activeElement).not.toBe(input);
    fireEvent.change(input, { target: { value: "450" } });
    fireEvent.blur(input);
    await act(async () => {});
    expect(onAssignedChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("Save submits the parsed amount once and closes", async () => {
    setViewport(true);
    const { onAssignedChange } = renderRow();
    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "450.5" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      fireEvent.click(screen.getByRole("button", { name: /Sav/ }));
    });
    expect(onAssignedChange).toHaveBeenCalledTimes(1);
    expect(onAssignedChange).toHaveBeenCalledWith(450.5);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("Cancel and Escape discard the draft without saving", () => {
    setViewport(true);
    const { onAssignedChange } = renderRow();
    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("spinbutton")).toBeNull();

    fireEvent.click(editButton());
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe(
      "400",
    );
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Escape" });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(onAssignedChange).not.toHaveBeenCalled();
  });

  it("rejects an empty amount inline and keeps the editor open", async () => {
    setViewport(true);
    const { onAssignedChange } = renderRow();
    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Enter an amount",
    );
    expect(onAssignedChange).not.toHaveBeenCalled();
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });

  it("keeps the editor and draft after a failed save", async () => {
    setViewport(true);
    const { onAssignedChange } = renderRow({
      onAssignedChange: vi.fn().mockRejectedValue(new Error("boom")),
    });
    expect(onAssignedChange).toBeDefined();
    fireEvent.click(editButton());
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "123" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't save",
    );
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe(
      "123",
    );
  });
});

describe("EnvelopeRow on desktop", () => {
  it("keeps inline editing: autofocus, Enter or blur saves, Escape cancels", async () => {
    setViewport(false);
    const { onAssignedChange } = renderRow();
    fireEvent.click(editButton());
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    fireEvent.change(input, { target: { value: "500" } });
    await act(async () => {
      fireEvent.blur(input);
    });
    expect(onAssignedChange).toHaveBeenCalledWith(500);

    fireEvent.click(editButton());
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Escape" });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(onAssignedChange).toHaveBeenCalledTimes(1);
  });

  it("does not save an unchanged amount", async () => {
    setViewport(false);
    const { onAssignedChange } = renderRow();
    fireEvent.click(editButton());
    await act(async () => {
      fireEvent.blur(screen.getByRole("spinbutton"));
    });
    expect(onAssignedChange).not.toHaveBeenCalled();
  });
});

describe("EnvelopeRow content", () => {
  it("wraps long names and shows negative amounts with a sign", () => {
    setViewport(true);
    renderRow({
      name: "A".repeat(80),
      available: -1234.5,
      assigned: 0,
      activity: -10,
    });
    expect(screen.getByRole("heading").className).toContain("break-words");
    expect(screen.getByRole("listitem").textContent).toContain("-£1,234.50");
  });

  it("labels the underfunded state in text", () => {
    setViewport(true);
    renderRow({ underfunded: true });
    expect(screen.getByText(/Underfunded/)).toBeTruthy();
  });
});
