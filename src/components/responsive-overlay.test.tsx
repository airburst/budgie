import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  ResponsiveOverlay,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "./responsive-overlay";

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

function Overlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <ResponsiveOverlay open={open} onOpenChange={(next) => !next && onClose()}>
      <ResponsiveOverlayContent>
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Form</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>Edit it</ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <button onClick={onClose}>Cancel</button>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

/** A card whose menu opens an editor; "Delete" removes the card (the opener). */
function MenuOpenedForm() {
  const [open, setOpen] = useState(false);
  const [exists, setExists] = useState(true);
  return (
    <main>
      <h1>Things</h1>
      {exists && (
        <DropdownMenu>
          <DropdownMenuTrigger>More actions</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setOpen(true)}>Edit</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ResponsiveOverlay open={open} onOpenChange={setOpen}>
        <ResponsiveOverlayContent>
          <ResponsiveOverlayTitle>Form</ResponsiveOverlayTitle>
          <button onClick={() => setOpen(false)}>Cancel</button>
          <button
            onClick={() => {
              setExists(false);
              setOpen(false);
            }}
          >
            Remove it
          </button>
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>
    </main>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe.each([
  ["phone drawer", true],
  ["desktop dialog", false],
])("ResponsiveOverlay focus restoration (%s)", (_name, phone) => {
  it("does not steal focus on first render while closed", () => {
    setViewport(phone);
    render(
      <main>
        <h1>Things</h1>
        <Overlay open={false} onClose={() => {}} />
      </main>,
    );
    expect(document.activeElement).toBe(document.body);
  });

  it("returns focus to the menu control that opened the form", async () => {
    setViewport(phone);
    const user = userEvent.setup();
    render(<MenuOpenedForm />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("falls back to the page heading when the opener was removed", async () => {
    setViewport(phone);
    const user = userEvent.setup();
    render(<MenuOpenedForm />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    await user.click(await screen.findByRole("button", { name: "Remove it" }));
    const heading = screen.getByRole("heading", { name: "Things" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});
