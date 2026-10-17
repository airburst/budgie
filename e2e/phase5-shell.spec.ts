import { expect, test } from "@playwright/test";

test("phone navigation fits at 320px, reaches every destination and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await expect(trigger).toBeVisible();
  const box = await trigger.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeHidden();

  for (const [label, route] of [
    ["Accounts", "/"],
    ["Subscriptions", "/scheduled"],
    ["Budget", "/budget"],
    ["Reports", "/reports"],
    ["Categories", "/categories"],
    ["Payees", "/payees"],
    ["Settings", "/settings"],
  ]) {
    await trigger.click();
    const sidebar = page.getByRole("dialog", { name: "Budgie" });
    await expect(sidebar).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox?.width).toBeCloseTo(288, 1);
    await sidebar.getByRole("link", { name: label, exact: true }).click();
    await expect(sidebar).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    const header = await page.locator("header").boundingBox();
    expect(header?.width).toBeLessThanOrEqual(320);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(321);
  }
  await trigger.click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Settings", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Backup..." }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("sidebar scrolls in landscape and releases its modal on desktop resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 320 });
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const sidebar = page.getByRole("dialog", { name: "Budgie" });
  await sidebar
    .getByRole("link", { name: "Settings", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    sidebar.getByRole("link", { name: "Settings", exact: true }),
  ).toBeInViewport();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(sidebar).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeHidden();
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page).toHaveURL(/#\/reports$/);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Categories", exact: true }),
  ).toBeVisible();
});

test("web Apple user agents do not reserve native title-bar space", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  });
  const page = await context.newPage();
  await page.goto("/#/settings");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeVisible();
  await expect(page.locator("header")).not.toHaveClass(/app-header-native-mac/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );
  await context.close();
});

test("navigation follows the 768px breakpoint without overflowing the header", async ({
  page,
}) => {
  await page.goto("/#/settings");
  for (const width of [320, 390, 430, 767, 768, 769, 1023, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const trigger = page.getByRole("button", { name: "Open navigation" });
    if (width < 768) await expect(trigger).toBeVisible();
    else await expect(trigger).toBeHidden();
    const geometry = await page.locator("header").evaluate((header) => ({
      width: header.clientWidth,
      scrollWidth: header.scrollWidth,
    }));
    expect(geometry.width).toBeLessThanOrEqual(width);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "About Budgie" })
    .click();
  await expect(page.locator('[data-slot="sheet-content"]')).toBeHidden();
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();
  await page
    .locator('[data-slot="dialog-content"]')
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
});
