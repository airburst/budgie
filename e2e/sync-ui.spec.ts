// SY-037 and SY-038: turn sync on with consent, sync now, and see the status.
// Runs against the second build (sync URL http://127.0.0.1:4599); the sync
// server is mocked at the network layer (e2e/helpers/sync-mock.ts).
import { expect, test, type Page } from "@playwright/test";
import { mockSyncServer, payeeEntry } from "./helpers/sync-mock";

const section = (page: Page) =>
  page.getByRole("region", { name: "Sync", exact: true });

async function openSettings(page: Page) {
  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(section(page)).toBeVisible();
}

async function giveConsent(page: Page) {
  await section(page).getByRole("button", { name: "Turn on sync" }).click();
  await page.getByLabel(/I understand, and I agree/).check();
  await section(page).getByRole("button", { name: "Continue" }).click();
}

async function connect(page: Page, code = "ABCD-EFGH") {
  await section(page).getByLabel("Code").fill(code);
  await section(page).getByLabel("Device name").fill("Test browser");
  await section(page).getByRole("button", { name: "Connect" }).click();
}

const indicator = (page: Page) =>
  page.getByRole("link", { name: /^Sync status:/ });

test("sync is off by default and nothing is sent before it is turned on", async ({
  page,
}) => {
  const mock = await mockSyncServer(page);
  await openSettings(page);
  await expect(section(page)).toContainText("Sync is off");
  await expect(
    section(page).getByRole("button", { name: "Turn on sync" }),
  ).toBeVisible();
  await expect(indicator(page)).toHaveCount(0);

  // The consent screen, and a code form, send nothing either.
  await section(page).getByRole("button", { name: "Turn on sync" }).click();
  await expect(
    section(page).getByRole("button", { name: "Continue" }),
  ).toBeDisabled();
  await page.waitForTimeout(500);
  expect(mock.requests).toEqual([]);
});

test("the consent screen states the terms and nothing proceeds until confirmed", async ({
  page,
}) => {
  const mock = await mockSyncServer(page);
  await openSettings(page);
  await section(page).getByRole("button", { name: "Turn on sync" }).click();

  const consent = page.getByTestId("sync-consent");
  await expect(consent).toContainText("All of your budget data");
  await expect(consent).toContainText("Cloudflare, in the EU");
  await expect(consent).toContainText("daily snapshot");
  await expect(consent).toContainText("30 days");
  await expect(consent).toContainText("not end-to-end encrypted");
  await expect(consent).toContainText("operator of the sync server can read it");
  await expect(consent).toContainText("stop syncing on this device");
  await expect(consent).toContainText("delete your data from the server");

  const next = section(page).getByRole("button", { name: "Continue" });
  await expect(next).toBeDisabled();
  await expect(section(page).getByLabel("Code")).toHaveCount(0);
  await page.getByLabel(/I understand, and I agree/).check();
  await expect(next).toBeEnabled();
  await page.getByLabel(/I understand, and I agree/).uncheck();
  await expect(next).toBeDisabled();

  // Cancel goes back to off, and nothing was sent.
  await section(page).getByRole("button", { name: "Cancel" }).click();
  await expect(section(page)).toContainText("Sync is off");
  expect(mock.requests).toEqual([]);
});

test("a wrong code shows a clear message and changes nothing", async ({
  page,
}) => {
  const mock = await mockSyncServer(page);
  await openSettings(page);
  await giveConsent(page);
  await connect(page, "WRONG-CODE");

  await expect(section(page).getByRole("alert")).toContainText(
    "That code was not recognised",
  );
  await expect(section(page).getByLabel("Code")).toBeVisible();
  expect(mock.requests).toEqual(["POST /v1/enrol"]);

  // Nothing was stored: after a reload sync is still off.
  await page.reload();
  await expect(section(page)).toContainText("Sync is off");
  await expect(indicator(page)).toHaveCount(0);
});

test("an offline server during connect shows a message and changes nothing", async ({
  page,
}) => {
  const mock = await mockSyncServer(page);
  mock.offline = true;
  await openSettings(page);
  await giveConsent(page);
  await connect(page);
  await expect(section(page).getByRole("alert")).toContainText(
    "could not reach the sync server",
  );
  await page.reload();
  await expect(section(page)).toContainText("Sync is off");
});

test("with no data on the server: connect, Start, then see the status", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await openSettings(page);
  await giveConsent(page);
  await connect(page);

  const start = page.getByTestId("sync-start");
  await expect(start).toContainText("the cloud is empty");
  await expect(page.getByTestId("sync-join")).toHaveCount(0);
  await start.getByRole("button", { name: "Start sync" }).click();

  const panel = page.getByTestId("sync-status-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("sync-state")).toContainText("Up to date");
  await expect(page.getByTestId("sync-pending")).toContainText("0");
  await expect(page.getByTestId("sync-last-synced")).not.toContainText(
    "Never",
  );
  await expect(page.getByTestId("sync-last-error")).toContainText("None");
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "synced");
  expect(mock.requests[0]).toBe("POST /v1/enrol");
  expect(mock.requests).toContain("POST /v1/sync");

  // It survives a reload.
  await page.reload();
  await expect(page.getByTestId("sync-status-panel")).toBeVisible();
  await expect(indicator(page)).toContainText("Synced");
});

test("with data on the server: Join warns, offers a backup, then replaces local data", async ({
  page,
}) => {
  const mock = await mockSyncServer(page);
  mock.seed([
    payeeEntry("Joined Payee", "0b8e5d7c-1a2b-4c3d-9e8f-7a6b5c4d3e2f"),
  ]);
  await openSettings(page);
  await giveConsent(page);
  await connect(page);

  const join = page.getByTestId("sync-join");
  await expect(join).toContainText("replaces all the data on this device");
  await expect(page.getByTestId("sync-start")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await join.getByRole("button", { name: "Download backup" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(
    /^budgie-export-\d{4}-\d\d-\d\d\.json$/,
  );

  await join
    .getByRole("button", { name: "Join and replace this device's data" })
    .click();
  await page.getByRole("button", { name: "Replace and join" }).click();
  await expect(page.getByTestId("sync-status-panel")).toBeVisible();
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "synced");

  // The joined data is on this device, with no reload.
  await page.evaluate(() => {
    window.location.hash = "#/payees";
  });
  await expect(page.getByText("Joined Payee")).toBeVisible();
});

test("Sync now shows progress, and open pages show rows it applied without a reload", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await openSettings(page);
  await giveConsent(page);
  await connect(page);
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(page.getByTestId("sync-status-panel")).toBeVisible();

  // Visit Payees so its query is cached (and fresh for a minute).
  await page.evaluate(() => {
    window.location.hash = "#/payees";
  });
  await expect(page.getByRole("heading", { name: "Payees" })).toBeVisible();
  await expect(page.getByText("Synced Payee")).toHaveCount(0);

  await page.evaluate(() => {
    window.location.hash = "#/settings";
  });
  const syncNow = page.getByRole("button", { name: "Sync now" });
  mock.delayMs = 600;
  mock.queuePull([
    payeeEntry("Synced Payee", "6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b"),
  ]);
  await syncNow.click();
  await expect(page.getByRole("button", { name: "Syncing…" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Syncing");
  await expect(page.getByRole("button", { name: "Sync now" })).toBeEnabled();

  await page.evaluate(() => {
    window.location.hash = "#/payees";
  });
  await expect(page.getByText("Synced Payee")).toBeVisible();
});

test("the header indicator shows offline and error states, and the panel shows the error", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await openSettings(page);
  await giveConsent(page);
  await connect(page);
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "synced");

  mock.offline = true;
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "offline");
  await expect(indicator(page)).toContainText("Offline");
  await expect(page.getByTestId("sync-state")).toContainText("Offline");

  mock.offline = false;
  mock.failSync = { status: 500, error: "server_error" };
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "error");
  await expect(page.getByTestId("sync-last-error")).not.toContainText("None");

  mock.failSync = null;
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "synced");
  await expect(page.getByTestId("sync-last-error")).toContainText("None");
});

test("an edit shows as pending, then synced without user action", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await openSettings(page);
  await giveConsent(page);
  await connect(page);
  await page.getByRole("button", { name: "Start sync" }).click();
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "synced");
  const pushedBefore = mock.pushed;

  await page.evaluate(() => {
    window.location.hash = "#/payees";
  });
  await page.getByRole("button", { name: "New Payee" }).click();
  await page.getByLabel("Name").fill("Edited Payee");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Edited Payee")).toBeVisible();

  await expect(indicator(page)).toHaveAttribute("data-sync-state", "pending");
  await expect(indicator(page)).toContainText("Pending 1");
  // The background scheduler syncs about 5 seconds after the write.
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "synced", {
    timeout: 20_000,
  });
  expect(mock.pushed).toBeGreaterThan(pushedBefore);
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 568 } });

  test("320px: consent, connect and status fit with 44px targets", async ({
    page,
  }) => {
    await mockSyncServer(page, { hasData: false });
    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
    await openSettings(page);
    const turnOn = section(page).getByRole("button", { name: "Turn on sync" });
    expect((await turnOn.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await turnOn.tap();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await page.getByLabel(/I understand, and I agree/).check();
    await section(page).getByRole("button", { name: "Continue" }).tap();
    expect(await overflow()).toBeLessThanOrEqual(1);
    await section(page).getByLabel("Code").fill("ABCD-EFGH");
    await section(page).getByLabel("Device name").fill("Phone");
    await section(page).getByRole("button", { name: "Connect" }).tap();
    await section(page).getByRole("button", { name: "Start sync" }).tap();
    await expect(page.getByTestId("sync-status-panel")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);

    const syncNow = page.getByRole("button", { name: "Sync now" });
    expect((await syncNow.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    const chip = indicator(page);
    await expect(chip).toBeVisible();
    expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    const box = (await chip.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  });
});
