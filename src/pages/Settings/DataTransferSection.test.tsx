import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTransferSection } from "./DataTransferSection";

const importPortableData = vi.fn();
const exportPortableData = vi.fn();

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

async function chooseFile(content = '{"version":1}') {
  const input = screen.getByLabelText(
    "Choose Budgie data package",
  ) as HTMLInputElement;
  const file = new File([content], "budgie-data.json", {
    type: "application/json",
  });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(content),
  });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  importPortableData.mockReset().mockResolvedValue(undefined);
  exportPortableData.mockReset().mockResolvedValue("{}");
  Reflect.defineProperty(window, "api", {
    value: { importPortableData, exportPortableData },
    configurable: true,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe.each([
  ["phone drawer", true, "drawer-popup"],
  ["desktop dialog", false, "dialog-content"],
])("DataTransferSection replacement confirmation (%s)", (_n, phone, slot) => {
  beforeEach(() => setViewport(phone));

  it("keeps every warning and focuses Cancel; nothing imports until confirmed", async () => {
    render(<DataTransferSection />);
    await chooseFile();

    expect(await screen.findByText("Replace local data?")).toBeTruthy();
    expect(
      screen.getByText(
        "Importing replaces all local financial data and preferences. This cannot be undone.",
      ),
    ).toBeTruthy();
    expect(document.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(importPortableData).not.toHaveBeenCalled();

    fireEvent.click(cancel);
    expect(importPortableData).not.toHaveBeenCalled();
  });
});

describe("DataTransferSection", () => {
  beforeEach(() => setViewport(true));

  it("reports an import failure as an alert", async () => {
    importPortableData.mockRejectedValueOnce(new Error("Invalid checksum"));
    render(<DataTransferSection />);
    await chooseFile();
    await screen.findByText("Replace local data?");
    const popup = document.querySelector(
      '[data-slot="drawer-popup"]',
    ) as HTMLElement;
    const confirm = within(popup).getByRole("button", { name: "Import data" });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Invalid checksum",
      ),
    );
    expect(importPortableData).toHaveBeenCalledTimes(1);
  });

  it("exports through a download and reports success", async () => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:x"),
      revokeObjectURL: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<DataTransferSection />);
    fireEvent.click(screen.getByRole("button", { name: "Export data" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Data exported"),
    );
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
