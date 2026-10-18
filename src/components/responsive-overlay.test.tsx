import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ResponsiveOverlay,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "./responsive-overlay";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

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

function Overlay({ open, onClose }: { open: boolean; onClose: () => void }) {
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
            <DropdownMenuItem onClick={() => setOpen(true)}>
              Edit
            </DropdownMenuItem>
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

describe("ResponsiveOverlay visual viewport", () => {
  it("tracks keyboard resizing and viewport panning and removes listeners", async () => {
    setViewport(false);
    const viewport = Object.assign(new EventTarget(), {
      height: 700,
      offsetTop: 0,
    });
    const remove = vi.spyOn(viewport, "removeEventListener");
    vi.stubGlobal("visualViewport", viewport);
    const { unmount } = render(<Overlay open onClose={() => {}} />);
    const dialog = await screen.findByRole("dialog");
    const frame = dialog.parentElement!;
    expect(frame.style.getPropertyValue("--dialog-viewport-height")).toBe(
      "700px",
    );
    act(() => {
      viewport.height = 320;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(frame.style.getPropertyValue("--dialog-viewport-height")).toBe(
      "320px",
    );
    act(() => {
      viewport.offsetTop = 80;
      viewport.dispatchEvent(new Event("scroll"));
    });
    expect(frame.style.getPropertyValue("--dialog-viewport-top")).toBe("80px");
    act(() => {
      viewport.height = 700;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(frame.style.getPropertyValue("--dialog-viewport-height")).toBe(
      "700px",
    );
    expect(frame.style.getPropertyValue("--dialog-viewport-top")).toBe("0px");
    unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("still renders without the Visual Viewport API", async () => {
    setViewport(false);
    vi.stubGlobal("visualViewport", undefined);
    render(<Overlay open onClose={() => {}} />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

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
