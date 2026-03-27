import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AboutDialog } from "./AboutDialog";

describe("AboutDialog", () => {
  const openExternal = vi.fn();

  beforeEach(() => {
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
});
