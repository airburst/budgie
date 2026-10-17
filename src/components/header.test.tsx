import { createPlatform } from "@/platform/platform";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Header from "./header";

const state = vi.hoisted(() => ({ electron: false, desktop: false }));

vi.mock("@/hooks/usePlatform", () => ({
  usePlatform: () =>
    createPlatform({
      electron: state.electron,
      touch: true,
      persistentStorage: true,
      pwaInstallation: true,
    }),
}));
vi.mock("@/pages/Settings/AboutDialog", () => ({
  AboutDialog: ({ open }: { open: boolean }) =>
    open ? <div>About content</div> : null,
}));
vi.mock("@/pages/Settings/BackupDialog", () => ({
  BackupDialog: () => null,
}));
vi.mock("@/pages/Settings/RestoreDialog", () => ({
  RestoreDialog: () => null,
}));

function RouteState() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current route">{location.pathname}</output>
      <button onClick={() => navigate("/reports")}>External navigation</button>
    </>
  );
}

function renderHeader(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
      <RouteState />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.electron = false;
  state.desktop = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: state.desktop,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("Header navigation", () => {
  it("opens the sidebar, identifies the active route, and closes on selection", async () => {
    renderHeader("/budget");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const sidebar = await screen.findByRole("dialog");
    expect(
      within(sidebar)
        .getByRole("link", { name: "Budget" })
        .getAttribute("aria-current"),
    ).toBe("page");
    for (const name of [
      "Accounts",
      "Subscriptions",
      "Budget",
      "Reports",
      "Categories",
      "Payees",
      "Settings",
    ]) {
      expect(within(sidebar).getByRole("link", { name })).toBeTruthy();
    }
    fireEvent.click(within(sidebar).getByRole("link", { name: "Payees" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Current route").textContent).toBe("/payees");
  });

  it("closes explicitly without navigating and restores trigger focus", async () => {
    renderHeader();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(trigger);
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Close",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Current route").textContent).toBe("/");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("hides native-only actions on web and opens About after closing navigation", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const sidebar = await screen.findByRole("dialog");
    expect(
      within(sidebar).queryByRole("button", { name: "Backup..." }),
    ).toBeNull();
    expect(
      within(sidebar).queryByRole("button", { name: "Restore..." }),
    ).toBeNull();
    expect(
      within(sidebar).queryByRole("button", { name: "Check for updates" }),
    ).toBeNull();
    fireEvent.click(
      within(sidebar).getByRole("button", { name: "About Budgie" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("About content")).toBeTruthy();
  });

  it("closes when the route changes outside the sidebar", async () => {
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByText("External navigation"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Current route").textContent).toBe("/reports");
  });

  it("keeps native actions in compact Electron navigation", async () => {
    state.electron = true;
    renderHeader();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const sidebar = await screen.findByRole("dialog");
    for (const name of ["Backup...", "Restore...", "Check for updates"]) {
      expect(within(sidebar).getByRole("button", { name })).toBeTruthy();
    }
  });

  it("reserves macOS title-bar space only in Electron", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    );
    const view = renderHeader();
    expect(
      document
        .querySelector("header")
        ?.classList.contains("app-header-native-mac"),
    ).toBe(false);
    state.electron = true;
    view.rerender(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(
      document
        .querySelector("header")
        ?.classList.contains("app-header-native-mac"),
    ).toBe(true);
    vi.restoreAllMocks();
  });
});
