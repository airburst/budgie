import { expect, test, type Page } from "@playwright/test";

// Synthetic data only.
async function seedAccount(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  return page.evaluate(async () => {
    const [account = null] = await window.api.createAccount({
      name: "Header e2e",
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
    if (!account) throw new Error("Account was not created");
    return account.id;
  });
}

const header = (page: Page) => page.locator("header");
const main = (page: Page) => page.locator("main");

async function headerOverflow(page: Page) {
  return header(page).evaluate((el) => el.scrollWidth - el.clientWidth);
}

test.describe("phone header chrome", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  const roots = [
    ["/", "Accounts"],
    ["/scheduled", "Subscriptions"],
    ["/budget", "Budget"],
    ["/reports", "Reports"],
    ["/categories", "Categories"],
    ["/payees", "Payees"],
    ["/settings", "Settings"],
  ] as const;

  for (const [path, title] of roots) {
    test(`${title}: title and hamburger in the header, h1 is screen-reader only`, async ({
      page,
    }) => {
      await seedAccount(page);
      await page.goto(`/#${path}`);
      await expect(
        header(page).getByText(title, { exact: true }).locator("visible=true"),
      ).toBeVisible();
      await expect(
        header(page).getByRole("button", { name: "Open navigation" }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Go back" })).toHaveCount(
        0,
      );
      const h1 = page.getByRole("heading", { level: 1, name: title });
      // sr-only: clipped to a 1px box.
      expect((await h1.boundingBox())!.width).toBeLessThanOrEqual(1);
      expect(await headerOverflow(page)).toBeLessThanOrEqual(0);
    });
  }

  const actions = [
    ["/", "Add account"],
    ["/scheduled", "Add subscription"],
    ["/categories", "New Category"],
    ["/payees", "New Payee"],
  ] as const;

  for (const [path, name] of actions) {
    test(`${path}: primary action "${name}" sits in the header, not the content`, async ({
      page,
    }) => {
      await seedAccount(page);
      await page.goto(`/#${path}`);
      const action = header(page).getByRole("button", { name });
      await expect(action).toBeVisible();
      const box = (await action.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(32);
      await expect(main(page).getByRole("button", { name })).toHaveCount(0);
      expect(await headerOverflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test("320px: the action never overflows the header", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await seedAccount(page);
    for (const path of ["/", "/scheduled", "/categories", "/payees"]) {
      await page.goto(`/#${path}`);
      await expect(
        header(page).getByRole("button", { name: /^(Add|New)/ }),
      ).toBeVisible();
      expect(await headerOverflow(page), path).toBeLessThanOrEqual(0);
    }
  });

  test("Forecast: back arrow and account title in the header only", async ({
    page,
  }) => {
    const id = await seedAccount(page);
    await page.goto(`/#/accounts/${id}`);
    await page.goto(`/#/forecast/${id}`);
    await expect(header(page).getByText("Forecast — Header e2e")).toBeVisible();
    await expect(
      main(page).getByRole("button", { name: "Go back" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toHaveCount(0);
    expect(
      (await page
        .getByRole("heading", { level: 1, name: "Header e2e" })
        .boundingBox())!.width,
    ).toBeLessThanOrEqual(1);
    await header(page).getByRole("button", { name: "Go back" }).tap();
    await expect(page).toHaveURL(new RegExp(`#/accounts/${id}$`));
  });

  test("Reconcile: back arrow goes to the account; title in the header", async ({
    page,
  }) => {
    const id = await seedAccount(page);
    const today = new Date().toISOString().slice(0, 10);
    await page.goto(`/#/reconcile/${id}?date=${today}&balance=0`);
    await expect(
      header(page).getByText("Reconcile — Header e2e"),
    ).toBeVisible();
    await expect(
      main(page).getByRole("button", { name: "Go back" }),
    ).toHaveCount(0);
    // The statement line stays; only the heading moved.
    await expect(main(page).getByText(/^Statement:/)).toBeVisible();
    await header(page).getByRole("button", { name: "Go back" }).tap();
    await expect(page).toHaveURL(new RegExp(`#/accounts/${id}$`));
  });

  test("the menu has no About and ends with the version", async ({ page }) => {
    await page.goto("/#/payees");
    await header(page).getByRole("button", { name: "Open navigation" }).tap();
    const nav = page.getByRole("dialog");
    await expect(nav.getByText(/^Version \d/)).toBeVisible();
    await expect(nav.getByRole("button", { name: "About Budgie" })).toHaveCount(
      0,
    );
  });
});

test.describe("from md the pages keep their own headings and actions", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("visible h1, in-content actions and Settings back arrow", async ({
    page,
  }) => {
    const id = await seedAccount(page);
    await page.goto("/#/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Accounts" }),
    ).not.toHaveCSS("position", "absolute");
    await expect(
      main(page).getByRole("button", { name: "Add account" }).first(),
    ).toBeVisible();

    await page.goto("/#/settings");
    await expect(
      main(page).getByRole("button", { name: "Go back" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Settings" }),
    ).not.toHaveCSS("position", "absolute");

    await page.goto(`/#/forecast/${id}`);
    await expect(
      main(page).getByRole("button", { name: "Go back" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Header e2e" }),
    ).not.toHaveCSS("position", "absolute");
  });
});
