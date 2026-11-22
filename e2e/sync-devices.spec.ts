// SY-040 and SY-041: devices, and the three ways to stop syncing. Runs against
// the sync-origin build; the server is mocked (e2e/helpers/sync-mock.ts),
// shared between two browser contexts where a test needs two devices.
import { expect, test, type Page } from "@playwright/test";
import { mockSyncServer } from "./helpers/sync-mock";

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

async function connect(page: Page, code: string, name = "Test browser") {
  await section(page).getByLabel("Code").fill(code);
  await section(page).getByLabel("Device name").fill(name);
  await section(page).getByRole("button", { name: "Connect" }).click();
}

async function startSyncing(page: Page, name = "Test browser") {
  await openSettings(page);
  await giveConsent(page);
  await connect(page, "ABCD-EFGH", name);
  await section(page).getByRole("button", { name: "Start sync" }).click();
  await expect(page.getByTestId("sync-status-panel")).toBeVisible();
}

const signOutButton = (page: Page) =>
  page
    .getByTestId("sync-sign-out")
    .getByRole("button", { name: "Sign out this device" });

test("Add a device shows a short code and when it expires", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await startSyncing(page);
  await expect(page.getByTestId("sync-device-code")).toHaveCount(0);
  await page.getByRole("button", { name: "Add a device" }).click();
  const box = page.getByTestId("sync-device-code");
  await expect(box).toContainText("Your code");
  await expect(box).toContainText(mock.issuedCodes[0]!);
  await expect(box).toContainText("Expires at");
  await expect(box).toContainText("works once");
});

test("a second browser enrols with the code and joins; a device can be removed after confirmation", async ({
  page,
  browser,
  baseURL,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await startSyncing(page, "First browser");
  await expect(page.getByTestId("sync-device")).toHaveCount(1);
  await expect(page.getByTestId("sync-device")).toContainText("This device");

  await page.getByRole("button", { name: "Add a device" }).click();
  await expect(page.getByTestId("sync-device-code")).toContainText("Your code");
  const code = mock.issuedCodes[0]!;
  await expect(page.getByTestId("sync-device-code")).toContainText(code);

  const second = await browser.newContext({ baseURL });
  try {
    const page2 = await second.newPage();
    await mockSyncServer(page2, { share: mock });
    await openSettings(page2);
    await giveConsent(page2);
    await connect(page2, code, "Second browser");
    await expect(page2.getByTestId("sync-join")).toBeVisible();
    // The code was single use.
    expect(mock.codes.has(code)).toBe(false);
    await page2
      .getByRole("button", { name: "Join and replace this device's data" })
      .click();
    await page2.getByRole("button", { name: "Replace and join" }).click();
    await expect(page2.getByTestId("sync-status-panel")).toBeVisible();

    // Both devices are listed, with this one marked.
    const rows2 = page2.getByTestId("sync-device");
    await expect(rows2).toHaveCount(2);
    await expect(rows2.filter({ hasText: "Second browser" })).toContainText(
      "This device",
    );
    const first = rows2.filter({ hasText: "First browser" });
    await expect(first).toContainText("Added");
    await expect(first).toContainText("Last seen");
    await expect(
      rows2.filter({ hasText: "Second browser" }).getByRole("button"),
    ).toHaveCount(0);

    await page.reload();
    const rows = page.getByTestId("sync-device");
    await expect(rows).toHaveCount(2);
    const other = rows.filter({ hasText: "Second browser" });
    await expect(other).not.toContainText("This device");

    // Cancelling the confirmation removes nothing.
    await other.getByRole("button", { name: "Remove Second browser" }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(rows).toHaveCount(2);

    await other.getByRole("button", { name: "Remove Second browser" }).click();
    await page.getByRole("button", { name: "Remove device" }).click();
    await expect(rows).toHaveCount(1);
    expect(
      mock.devices.find((d) => d.name === "Second browser")?.revoked,
    ).toBe(true);

    // The removed device finds out on its next sync.
    await page2.getByRole("button", { name: "Sync now" }).click();
    await expect(page2.getByTestId("sync-state")).toContainText("Disconnected");
  } finally {
    await second.close();
  }
});

test("Disable on this device keeps everything and turns back on without a code", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await startSyncing(page);
  const stop = page.getByTestId("sync-disable");
  await stop.getByRole("button", { name: "Disable on this device" }).click();
  await expect(page.getByTestId("sync-state")).toContainText(
    "Off on this device",
  );
  expect(mock.devices.filter((d) => !d.revoked)).toHaveLength(1);
  expect(mock.hasData).toBe(true);

  const enrols = () => mock.requests.filter((r) => r.includes("/enrol")).length;
  const enrolsBefore = enrols();
  await stop.getByRole("button", { name: "Turn sync back on" }).click();
  await expect(page.getByTestId("sync-state")).toContainText("Up to date");
  expect(enrols()).toBe(enrolsBefore);

  await page.reload();
  await expect(page.getByTestId("sync-status-panel")).toBeVisible();
});

test("Sign out this device revokes it, and turning sync on again needs a new code", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await startSyncing(page);
  await signOutButton(page).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();

  await expect(section(page)).toContainText("Sync is off");
  expect(mock.devices[0]!.revoked).toBe(true);
  await page.reload();
  await expect(section(page)).toContainText("Sync is off");

  // The old code is spent: a new one is needed.
  mock.codes.add("NEWC-ODE1");
  await giveConsent(page);
  await connect(page, "ABCD-EFGH");
  await expect(section(page).getByRole("alert")).toContainText(
    "That code was not recognised",
  );
  await connect(page, "NEWC-ODE1");
  await expect(page.getByTestId("sync-join")).toBeVisible();
});

test("signing out offline explains, changes nothing, and offers a local-only sign out", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await startSyncing(page);
  mock.offline = true;
  await signOutButton(page).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();

  const offline = page.getByTestId("sync-sign-out-offline");
  await expect(offline).toContainText("could not reach the sync server");
  await expect(offline).toContainText(
    "remove this device from the device list on another",
  );
  await expect(page.getByTestId("sync-status-panel")).toBeVisible();

  await offline
    .getByRole("button", { name: "Sign out on this device only" })
    .click();
  await expect(section(page)).toContainText("Sync is off");
  // The server still lists the device: it is removed from another one.
  expect(mock.devices[0]!.revoked).toBe(false);
});

test("Delete my cloud data needs a typed confirmation, keeps local data and turns sync off here", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await startSyncing(page);

  await page
    .getByTestId("sync-delete")
    .getByRole("button", { name: "Delete my cloud data" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("other devices will stop syncing");
  await expect(dialog).toContainText("up to 7 days");
  const confirm = dialog.getByRole("button", { name: "Delete cloud data" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type delete to confirm").fill("delet");
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Type delete to confirm").fill("delete");
  await confirm.click();

  const result = page.getByTestId("sync-delete-result");
  await expect(result).toContainText("other devices will stop syncing");
  await expect(result).toContainText("up to 7 days");
  expect(mock.hasData).toBe(false);
  expect(mock.requests).toContain("DELETE /v1/data");
  await expect(page.getByTestId("sync-state")).toContainText(
    "Cloud data was deleted",
  );
  await expect(
    page.getByTestId("sync-disable").getByRole("button", {
      name: "Start sync again",
    }),
  ).toBeVisible();
  // Still connected: the token was kept.
  expect(mock.devices[0]!.revoked).toBe(false);

  // Start sync works again.
  await page.getByRole("button", { name: "Start sync again" }).click();
  await expect(page.getByTestId("sync-state")).toContainText("Up to date");
  expect(mock.hasData).toBe(true);
});

test("Cancel in the half-set-up state signs the device out", async ({
  page,
}) => {
  const mock = await mockSyncServer(page, { hasData: false });
  await openSettings(page);
  await giveConsent(page);
  await connect(page, "ABCD-EFGH");
  await expect(page.getByTestId("sync-start")).toBeVisible();
  await page
    .getByTestId("sync-start")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(section(page)).toContainText("Sync is off");
  expect(mock.devices[0]!.revoked).toBe(true);
});

test.describe("on a phone", () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 568 } });

  test("320px: devices and the three stop actions fit with 44px targets", async ({
    page,
  }) => {
    await mockSyncServer(page, { hasData: false });
    await startSyncing(page, "Phone");
    await page.getByRole("button", { name: "Add a device" }).tap();
    await expect(page.getByTestId("sync-device-code")).toBeVisible();

    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(1);
    for (const name of [
      "Add a device",
      "Disable on this device",
      "Sign out this device",
      "Delete my cloud data",
    ]) {
      const button = page.getByRole("button", { name, exact: true });
      await button.scrollIntoViewIfNeeded();
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    }

    await page
      .getByRole("button", { name: "Delete my cloud data", exact: true })
      .tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const input = dialog.getByLabel("Type delete to confirm");
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    expect(await overflow()).toBeLessThanOrEqual(1);
  });
});
