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
import { HeaderAction, PageChromeProvider, PageHeader } from "./page-chrome";

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

  it("hides native-only actions on web and ends with a small version line, not About", async () => {
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
    expect(
      within(sidebar).queryByRole("button", { name: "About Budgie" }),
    ).toBeNull();
    const version = within(sidebar).getByText(/^Version /);
    expect(version.textContent).toMatch(/^Version \d+\.\d+\.\d+/);
    expect(version.className).toContain("text-center");
    expect(version.className).toContain("text-xs");
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

function renderChrome(action = true) {
  return render(
    <MemoryRouter initialEntries={["/forecast/1"]}>
      <PageChromeProvider>
        <Header />
        <PageHeader title="Forecast — Current" onBack={onBack} />
        {action && (
          <HeaderAction>
            <button>Add thing</button>
          </HeaderAction>
        )}
      </PageChromeProvider>
    </MemoryRouter>,
  );
}
const onBack = vi.fn();

describe("Page chrome on phones", () => {
  beforeEach(() => onBack.mockReset());

  it("shows the page title and a back arrow instead of the hamburger", () => {
    renderChrome();
    expect(screen.getByText("Forecast — Current")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Open navigation" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders the page action once, inside the header", () => {
    renderChrome();
    const buttons = screen.getAllByRole("button", { name: "Add thing" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.closest("header")).toBeTruthy();
  });

  it("keeps the hamburger and route title when a page sets no chrome", () => {
    render(
      <MemoryRouter initialEntries={["/payees"]}>
        <PageChromeProvider>
          <Header />
        </PageChromeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Payees")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
  });
});

describe("Page chrome from md", () => {
  it("renders the action in place, not in the header", () => {
    state.desktop = true;
    renderChrome();
    const button = screen.getByRole("button", { name: "Add thing" });
    expect(button.closest("header")).toBeNull();
  });
});
