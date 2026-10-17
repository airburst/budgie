import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupDialog } from "./BackupDialog";
import { RestoreDialog } from "./RestoreDialog";

const api = {
  getPreferences: vi.fn(),
  getDefaultBackupFolder: vi.fn(),
  setPreferences: vi.fn(),
  chooseBackupFolder: vi.fn(),
  chooseBackupFile: vi.fn(),
  createBackup: vi.fn(),
  listBackups: vi.fn(),
  restoreBackup: vi.fn(),
};

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
  api.getPreferences.mockReset().mockResolvedValue({});
  api.getDefaultBackupFolder.mockReset().mockResolvedValue("/data/backups");
  api.setPreferences.mockReset().mockResolvedValue(undefined);
  api.chooseBackupFolder.mockReset();
  api.chooseBackupFile.mockReset();
  api.createBackup
    .mockReset()
    .mockResolvedValue({ path: "/data/backups/budgie-1.db" });
  api.listBackups.mockReset().mockResolvedValue([
    {
      name: "budgie-1.db",
      path: "/data/backups/budgie-1.db",
      size: 2048,
      createdAt: "2026-03-01T10:00:00.000Z",
    },
  ]);
  api.restoreBackup.mockReset().mockResolvedValue(undefined);
  Reflect.defineProperty(window, "api", { value: api, configurable: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("BackupDialog", () => {
  it("is a drawer on phones with no focused input", async () => {
    setViewport(true);
    render(<BackupDialog open onOpenChange={() => {}} />);
    expect(
      await screen.findByRole("heading", { name: "Create Backup" }),
    ).toBeTruthy();
    expect(document.querySelector('[data-slot="drawer-popup"]')).toBeTruthy();
    await act(async () => {});
    expect(document.activeElement?.tagName).not.toBe("INPUT");
    expect(
      screen.getByRole("button", { name: "Choose backup folder" }),
    ).toBeTruthy();
  });

  it("is a dialog on desktop", async () => {
    setViewport(false);
    render(<BackupDialog open onOpenChange={() => {}} />);
    await screen.findByLabelText("Backup folder");
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeTruthy();
  });

  it("creates once on a double tap and reports the saved file", async () => {
    setViewport(true);
    render(<BackupDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Backup folder") as HTMLInputElement).value,
      ).toBe("/data/backups"),
    );
    const create = screen.getByRole("button", { name: "Create Backup" });
    fireEvent.click(create);
    fireEvent.click(create);
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Saved: budgie-1.db",
      ),
    );
    expect(api.createBackup).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog and shows a failure inline", async () => {
    setViewport(true);
    api.createBackup.mockRejectedValueOnce(new Error("Disk full"));
    const onOpenChange = vi.fn();
    render(<BackupDialog open onOpenChange={onOpenChange} />);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Backup folder") as HTMLInputElement).value,
      ).toBe("/data/backups"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Backup" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Disk full"),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe.each([
  ["phone drawer", true, "drawer-popup"],
  ["desktop dialog", false, "dialog-content"],
])("RestoreDialog (%s)", (_name, phone, slot) => {
  beforeEach(() => setViewport(phone));

  it("requires a selection, then a destructive confirmation with all warnings", async () => {
    render(<RestoreDialog open onOpenChange={() => {}} />);
    const item = await screen.findByRole("button", { name: /budgie-1\.db/ });
    expect(document.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
    const restore = screen.getByRole("button", { name: "Restore" });
    expect((restore as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(item);
    expect(item.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("Restore this backup?")).toBeTruthy();
    expect(
      screen.getByText(
        "This will replace all current data and restart the app immediately. This cannot be undone.",
      ),
    ).toBeTruthy();
    expect(api.restoreBackup).not.toHaveBeenCalled();
    const cancel = screen.getAllByRole("button", { name: "Cancel" }).at(-1)!;
    await waitFor(() => expect(document.activeElement).toBe(cancel));
  });

  it("keeps the dialog and selection when the restore fails", async () => {
    api.restoreBackup.mockRejectedValueOnce(new Error("Corrupt backup"));
    const onOpenChange = vi.fn();
    render(<RestoreDialog open onOpenChange={onOpenChange} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /budgie-1\.db/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    const confirm = (
      await screen.findAllByRole("button", { name: "Restore" })
    ).at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Corrupt backup"),
    );
    expect(api.restoreBackup).toHaveBeenCalledWith("/data/backups/budgie-1.db");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("shows the empty state", async () => {
    api.listBackups.mockResolvedValueOnce([]);
    render(<RestoreDialog open onOpenChange={() => {}} />);
    expect(
      await screen.findByText("No backups found in the configured folder."),
    ).toBeTruthy();
  });
});
