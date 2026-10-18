import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

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

function renderConfirm() {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Delete thing?"
      description="Cannot be undone."
      onConfirm={onConfirm}
    />,
  );
  return { onOpenChange, onConfirm };
}

afterEach(() => vi.unstubAllGlobals());

describe.each([
  ["phone drawer", true, "drawer-popup"],
  ["desktop dialog", false, "dialog-content"],
])("ConfirmDialog (%s)", (_name, phone, slot) => {
  it("renders the matching surface and focuses Cancel first", async () => {
    setViewport(phone);
    renderConfirm();
    expect(await screen.findByText("Delete thing?")).toBeTruthy();
    expect(document.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });

  it("Cancel closes without confirming", async () => {
    setViewport(phone);
    const { onOpenChange, onConfirm } = renderConfirm();
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Delete confirms once and closes", async () => {
    setViewport(phone);
    const { onOpenChange, onConfirm } = renderConfirm();
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
