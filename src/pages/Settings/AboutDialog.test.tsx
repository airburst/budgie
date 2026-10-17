import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AboutDialog } from "./AboutDialog";

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

describe.each([
  ["phone drawer", true, "drawer-popup"],
  ["desktop dialog", false, "dialog-content"],
])("AboutDialog (%s)", (_name, phone, slot) => {
  const openExternal = vi.fn();

  beforeEach(() => {
    setViewport(phone);
    vi.stubGlobal("__APP_VERSION__", "1.2.3");
    openExternal.mockReset();
    Reflect.defineProperty(window, "api", {
      value: { openExternal },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the matching surface with the version and safe initial focus", async () => {
    render(<AboutDialog open={true} onOpenChange={() => {}} />);
    expect(await screen.findByText("Version 1.2.3")).toBeTruthy();
    expect(document.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
    const close = screen.getAllByRole("button", { name: "Close" })[0]!;
    await waitFor(() => expect(document.activeElement).toBe(close));
  });

  it("opens the GitHub changelog when the link is clicked", () => {
    render(<AboutDialog open={true} onOpenChange={() => {}} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "See what's changed in this version",
      }),
    );

    expect(openExternal).toHaveBeenCalledWith(
      "https://github.com/airburst/budgie/blob/main/CHANGELOG.md",
    );
  });

  it("Close dismisses it", () => {
    const onOpenChange = vi.fn();
    render(<AboutDialog open={true} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
