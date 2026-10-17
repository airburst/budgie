import { expect, test, type Page } from "@playwright/test";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

// Top-level drawer only: nested confirmations are also drawers.
const drawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"]:not([data-nested])');
const confirmDrawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"][data-nested]');

const overflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

async function expectBottomAnchored(
  page: Page,
  popup: ReturnType<typeof drawer>,
) {
  const box = await popup.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(
    viewport!.height - 1,
  );
  expect(box!.width).toBeLessThanOrEqual(viewport!.width);
}

async function expectTouchTargets(locator: ReturnType<Page["locator"]>) {
  for (const button of await locator.all()) {
    if (!(await button.isVisible())) continue;
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(43.5);
  }
}

async function openAdvanced(page: Page) {
  await page.goto("/#/settings");
  await page.waitForFunction(() => Boolean(window.api));
  await page.getByRole("tab", { name: "Advanced" }).click();
}

async function chooseDataFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import data" }).click();
  await (await chooser).setFiles(file);
}

const validPackage = async () => ({
  name: "budgie-data.json",
  mimeType: "application/json",
  buffer: await readFile("src/tests/fixtures/portable-data-v1.json"),
});
const invalidPackage = () => ({
  name: "broken.json",
  mimeType: "application/json",
  buffer: Buffer.from('{"not":"a budgie package"}'),
});

test.describe("web phone: portable transfer", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("replacement confirmation is a bottom drawer with Cancel focused and every warning", async ({
    page,
  }) => {
    await openAdvanced(page);

    const buttons = page
      .locator('[data-slot="button"]')
      .filter({ hasText: /Export data|Import data/ });
    await expect(buttons).toHaveCount(2);
    await expectTouchTargets(buttons);

    await chooseDataFile(page, await validPackage());
    const confirm = drawer(page);
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText("Replace local data?")).toBeVisible();
    await expect(
      confirm.getByText(
        "Importing replaces all local financial data and preferences. This cannot be undone.",
      ),
    ).toBeVisible();
    await expectBottomAnchored(page, confirm);
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expectTouchTargets(confirm.getByRole("button"));
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // Cancel leaves everything as it was.
    await confirm.getByRole("button", { name: "Cancel" }).tap();
    await expect(drawer(page)).toHaveCount(0);
    await expect(page.getByText("Data imported")).toHaveCount(0);
  });

  test("a failed import shows an inline error and preserves local data", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(() => Boolean(window.api));
    const name = `Transfer keep ${Date.now()}`;
    await page.evaluate(async (accountName) => {
      await window.api.createAccount({
        name: accountName,
        number: null,
        type: "bank",
        balance: 0,
        currency: "GBP",
        notes: null,
        interestRate: null,
        creditLimit: null,
        pendingReconcileBalance: null,
        pendingReconcileDate: null,
      });
    }, name);

    await openAdvanced(page);
    await chooseDataFile(page, invalidPackage());
    const confirm = drawer(page);
    await expect(confirm.getByText("Replace local data?")).toBeVisible();
    await confirm.getByRole("button", { name: "Import data" }).tap();

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(drawer(page)).toHaveCount(0);
    await expect(page.getByText("Data imported")).toHaveCount(0);

    const names = await page.evaluate(async () =>
      (await window.api.getAccounts()).map((account) => account.name),
    );
    expect(names).toContain(name);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("native backup, restore and QIF import are not offered on web", async ({
    page,
  }) => {
    await page.goto("/#/settings");
    await page.waitForFunction(() => Boolean(window.api));
    await page.getByRole("button", { name: "Open navigation" }).tap();
    const nav = page.getByRole("dialog", { name: "Budgie" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button", { name: "Backup..." })).toHaveCount(0);
    await expect(nav.getByRole("button", { name: "Restore..." })).toHaveCount(
      0,
    );
    await nav.getByRole("button", { name: "About Budgie" }).tap();
    await page.keyboard.press("Escape");

    const accountId = await page.evaluate(async () => {
      const [account = null] = await window.api.createAccount({
        name: `Transfer capability ${Date.now()}`,
        number: null,
        type: "bank",
        balance: 0,
        currency: "GBP",
        notes: null,
        interestRate: null,
        creditLimit: null,
        pendingReconcileBalance: null,
        pendingReconcileDate: null,
      });
      return account?.id;
    });
    await page.goto(`/#/accounts/${accountId}`);
    await page.getByRole("button", { name: "More actions" }).tap();
    const menu = page.locator('[data-slot="dropdown-menu-content"]');
    await expect(menu.getByText("Edit account")).toBeVisible();
    await expect(menu.getByText("Import", { exact: true })).toHaveCount(0);
  });

  test("no horizontal overflow at 320px with the confirmation open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openAdvanced(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await chooseDataFile(page, await validPackage());
    await expect(drawer(page)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    const box = await drawer(page).boundingBox();
    expect(box!.width).toBeLessThanOrEqual(320);
  });
});

test.describe("web desktop: portable transfer", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("confirmation stays a centered dialog and Import is not offered", async ({
    page,
  }) => {
    await openAdvanced(page);
    // Buttons keep their compact inline layout on desktop.
    const exportBox = await page
      .getByRole("button", { name: "Export data" })
      .boundingBox();
    expect(exportBox!.width).toBeLessThan(300);

    await chooseDataFile(page, await validPackage());
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Replace local data?")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Backup..." })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");
  });
});

// Electron-only surfaces (QIF review, native backup/restore) cannot run on the
// web runtime, so these journeys stub a synthetic `window.api` before the app
// boots. The app then takes its Electron capability path.
const SYNTHETIC_QIF = `!Type:Bank
D01/03/2026
PA very long synthetic payee name that must truncate instead of overflowing the card
T-120.45
MSynthetic memo
^
D02/03/2026
PSynthetic salary
T2500.00
^
D03/03/2026
PCorner shop
T-4.20
^`;

async function stubElectron(page: Page) {
  await page.addInitScript((qif) => {
    const account = {
      id: 1,
      name: "Synthetic current",
      number: null,
      type: "bank",
      balance: 100,
      currency: "GBP",
      notes: null,
      interestRate: null,
      creditLimit: null,
      lastReconcileDate: null,
      pendingReconcileBalance: null,
      pendingReconcileDate: null,
      closedAt: null,
    };
    const backups = [
      {
        name: "budgie-backup-2026-03-01-a-rather-long-file-name.db",
        path: "/synthetic/backups/budgie-backup-2026-03-01-a-rather-long-file-name.db",
        size: 20480,
        createdAt: "2026-03-01T10:00:00.000Z",
      },
      {
        name: "budgie-backup-2026-02-01.db",
        path: "/synthetic/backups/budgie-backup-2026-02-01.db",
        size: 19000,
        createdAt: "2026-02-01T10:00:00.000Z",
      },
    ];
    const impl: Record<string, (...args: unknown[]) => unknown> = {
      getAccounts: async () => [account],
      getPreferences: async () => ({}),
      setPreferences: async () => undefined,
      getDefaultBackupFolder: async () => "/synthetic/backups",
      listBackups: async () => backups,
      createBackup: async () => ({ path: "/synthetic/backups/new.db" }),
      restoreBackup: async () => {
        throw new Error("Synthetic restore failure");
      },
      chooseQifFile: async () =>
        "/synthetic/statement-with-a-very-long-file-name-2026.qif",
      readQifFile: async () => qif,
    };
    (window as unknown as { api: unknown }).api = new Proxy(impl, {
      get: (target, key: string) => {
        if (key in target) return target[key];
        if (key.startsWith("on")) return () => () => undefined;
        return async () => [];
      },
    });
  }, SYNTHETIC_QIF);
}

test.describe("electron-capability phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("QIF review is an expanded drawer of cards; dirty selection asks before discard", async ({
    page,
  }) => {
    await stubElectron(page);
    await page.goto("/#/accounts/1");
    await page.getByRole("button", { name: "More actions" }).tap();
    await page
      .locator('[data-slot="dropdown-menu-content"]')
      .getByText("Import", { exact: true })
      .tap();

    const review = drawer(page);
    await expect(review).toBeVisible();
    await expect(review.getByText(/Import — statement-with/)).toBeVisible();
    await expect(review.getByRole("table")).toHaveCount(0);
    await expect(review.getByRole("checkbox")).toHaveCount(3);
    await expect(review.getByText("3 transactions: 3 new")).toBeVisible();

    // Expanded: nearly the whole viewport height, anchored at the bottom.
    const box = await review.boundingBox();
    expect(box!.height).toBeGreaterThan(844 * 0.85);
    await expectBottomAnchored(page, review);
    await expect(review.getByRole("checkbox").first()).not.toBeFocused();
    await expectTouchTargets(review.getByRole("button"));
    for (const label of await review.locator("label").all()) {
      expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // Toggling a card makes the selection dirty.
    await review.getByRole("checkbox").nth(2).tap();
    await expect(
      review.getByRole("button", { name: "Import 2 transactions" }),
    ).toBeVisible();
    await review.getByRole("button", { name: "Cancel" }).tap();
    const discard = confirmDrawer(page);
    await expect(discard.getByText("Discard import?")).toBeVisible();
    await expect(discard.getByRole("button", { name: "Cancel" })).toBeFocused();
    await discard.getByRole("button", { name: "Cancel" }).tap();
    await expect(confirmDrawer(page)).toHaveCount(0);
    await expect(review).toBeVisible();
    await expect(review.getByRole("checkbox").nth(2)).not.toBeChecked();

    await review.getByRole("button", { name: "Cancel" }).tap();
    await confirmDrawer(page).getByRole("button", { name: "Discard" }).tap();
    await expect(drawer(page)).toHaveCount(0);
  });

  test("backup and restore are drawers; restore needs a destructive confirmation and keeps state on failure", async ({
    page,
  }) => {
    await stubElectron(page);
    await page.goto("/#/accounts/1");

    await page.getByRole("button", { name: "Open navigation" }).tap();
    await page
      .getByRole("dialog", { name: "Budgie" })
      .getByRole("button", { name: "Backup..." })
      .tap();
    const backup = drawer(page).filter({ hasText: "Create Backup" });
    await expect(backup).toBeVisible();
    await expect(
      backup.getByRole("textbox", { name: "Backup folder" }),
    ).not.toBeFocused();
    await expectBottomAnchored(page, backup);
    await expectTouchTargets(backup.getByRole("button"));
    await backup.getByRole("button", { name: "Create Backup" }).tap();
    await expect(backup.getByRole("status")).toContainText("Saved: new.db");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await backup.getByRole("button", { name: "Close" }).tap();
    await expect(drawer(page)).toHaveCount(0);

    await page.getByRole("button", { name: "Open navigation" }).tap();
    await page
      .getByRole("dialog", { name: "Budgie" })
      .getByRole("button", { name: "Restore..." })
      .tap();
    const restore = drawer(page).filter({ hasText: "Restore Backup" });
    await expect(restore).toBeVisible();
    await expect(
      restore.getByRole("button", { name: "Restore" }),
    ).toBeDisabled();
    await restore
      .getByRole("button", { name: /a-rather-long-file-name/ })
      .tap();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await restore.getByRole("button", { name: "Restore", exact: true }).tap();

    const confirm = confirmDrawer(page);
    await expect(confirm.getByText("Restore this backup?")).toBeVisible();
    await expect(
      confirm.getByText(
        "This will replace all current data and restart the app immediately. This cannot be undone.",
      ),
    ).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await confirm.getByRole("button", { name: "Restore" }).tap();

    await expect(restore.getByRole("alert")).toContainText(
      "Synthetic restore failure",
    );
    await expect(restore).toBeVisible();
    await expect(
      restore.getByRole("button", { name: /a-rather-long-file-name/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("no horizontal overflow at 320px for QIF review and restore", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await stubElectron(page);
    await page.goto("/#/accounts/1");
    await page.getByRole("button", { name: "More actions" }).tap();
    await page
      .locator('[data-slot="dropdown-menu-content"]')
      .getByText("Import", { exact: true })
      .tap();
    await expect(drawer(page)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(
      await drawer(page).evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(0);
  });
});

test.describe("electron-capability desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("QIF review keeps the table dialog; backup stays a dialog", async ({
    page,
  }) => {
    await stubElectron(page);
    await page.goto("/#/accounts/1");
    await page.getByRole("button", { name: "Import", exact: true }).click();

    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("table")).toBeVisible();
    await expect(
      dialog.getByRole("columnheader", { name: "Deposit" }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("menuitem", { name: "Backup..." }).click();
    await expect(
      page
        .locator('[data-slot="dialog-content"]')
        .getByText("Create Backup", { exact: true })
        .first(),
    ).toBeVisible();
    await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(0);
  });
});
