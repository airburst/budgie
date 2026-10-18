import { expect, test, type Page } from "@playwright/test";

async function overflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

const drawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"]:not([data-nested])');

test.describe("settings on a phone", () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 568 } });

  test("320px: every tab fits and targets are 44px; web hides native actions", async ({
    page,
  }) => {
    await page.goto("/#/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    for (const name of ["General", "Advanced", "Shortcuts"]) {
      const tab = page.getByRole("tab", { name });
      expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
      await tab.tap();
      expect(await overflow(page), `${name} overflow`).toBeLessThanOrEqual(1);
    }

    // General: theme buttons and the autofill row are 44px targets.
    await page.getByRole("tab", { name: "General" }).tap();
    for (const label of ["Light theme", "System theme", "Dark theme"]) {
      const box = (await page
        .getByRole("button", { name: label })
        .boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(43.5);
      expect(box.height).toBeGreaterThanOrEqual(43.5);
    }
    const autofill = (await page
      .getByText("Automatically fill transaction details")
      .boundingBox())!;
    expect(autofill.height).toBeGreaterThanOrEqual(43.5);

    // Advanced: portable transfer only; native backup/restore/folders absent.
    await page.getByRole("tab", { name: "Advanced" }).tap();
    await expect(
      page.getByRole("button", { name: "Export data" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Import data" }),
    ).toBeEnabled();
    await expect(page.getByText("Backup folder")).toHaveCount(0);
    await expect(page.getByText("Data folder")).toHaveCount(0);
    await expect(page.getByText(/QIF/i)).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("the page has a single scroller", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByRole("tab", { name: "General" }).tap();
    const nested = await page.evaluate(
      () =>
        [...document.querySelectorAll("main *")].filter((el) => {
          const style = getComputedStyle(el);
          return (
            /(auto|scroll)/.test(style.overflowY) &&
            el.scrollHeight > el.clientHeight + 1
          );
        }).length,
    );
    expect(nested).toBe(0);
  });

  test("the menu ends with a small centred version line instead of About", async ({
    page,
  }) => {
    await page.goto("/#/settings");
    await page.getByRole("button", { name: "Open navigation" }).tap();
    const nav = page.getByRole("dialog");
    await expect(nav.getByRole("button", { name: "About Budgie" })).toHaveCount(
      0,
    );
    const version = nav.getByText(/^Version \d/);
    await expect(version).toBeVisible();
    const box = (await version.boundingBox())!;
    const sheet = (await nav.boundingBox())!;
    // Centred along the bottom of the menu.
    expect(
      Math.abs(box.x + box.width / 2 - (sheet.x + sheet.width / 2)),
    ).toBeLessThanOrEqual(2);
    expect(box.y).toBeGreaterThan(sheet.y + sheet.height * 0.7);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe("settings on desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("About stays a dialog", async ({ page }) => {
    await page.goto("/#/settings");
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("menuitem", { name: "About Budgie" }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Version");
    await expect(page.locator('[data-slot="drawer-popup"]')).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});
