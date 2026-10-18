import { expect, test } from "@playwright/test";

const textVars = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(
      ["xs", "sm", "base", "lg", "xl", "2xl"].map((step) => [
        step,
        // The minifier writes .875rem; compare as numbers.
        parseFloat(style.getPropertyValue(`--text-${step}`)),
      ]),
    );
  });

test.describe("phone type scale", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("every text step is one step larger below md", async ({ page }) => {
    await page.goto("/#/payees");
    expect(await textVars(page)).toEqual({
      xs: 0.875,
      sm: 1,
      base: 1.125,
      lg: 1.25,
      xl: 1.5,
      "2xl": 1.875,
    });
  });

  test("fields stay at 16px or more so iOS never zooms on focus", async ({
    page,
  }) => {
    await page.goto("/#/payees");
    const search = page.getByPlaceholder("Search payees…");
    const size = await search.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test("no horizontal overflow at 320px on the busiest pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of [
      "/",
      "/scheduled",
      "/budget",
      "/reports",
      "/categories",
      "/payees",
      "/settings",
    ]) {
      await page.goto(`/#${path}`);
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("desktop type scale", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps the default Tailwind scale from md", async ({ page }) => {
    await page.goto("/#/payees");
    expect(await textVars(page)).toMatchObject({
      xs: 0.75,
      sm: 0.875,
      base: 1,
    });
    const size = await page
      .getByPlaceholder("Search payees…")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBe(14);
  });
});
