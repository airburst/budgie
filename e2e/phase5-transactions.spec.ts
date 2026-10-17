import { expect, test, type Page } from "@playwright/test";

async function seedTransactions(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  const accountId = await page.evaluate(async () => {
    // Reset view-filter preferences so earlier tests' state doesn't leak in.
    const existingPreferences = await window.api.getPreferences();
    await window.api.setPreferences({
      ...existingPreferences,
      hideReconciled: false,
      hideCleared: false,
    });
    const [account = null] = await window.api.createAccount({
      name: `Transactions cards ${Date.now()}`,
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
    const today = new Date().toISOString().slice(0, 10);
    await window.api.createTransaction({
      accountId: account.id,
      date: today,
      payee: "Supermarket",
      amount: -42.8,
      categoryId: null,
      notes: "Weekly shop and household essentials.",
      cleared: false,
    });
    await window.api.createTransaction({
      accountId: account.id,
      date: today,
      payee: "Salary",
      amount: 2104.5,
      categoryId: null,
      notes: null,
      cleared: false,
    });
    return account.id;
  });
  // Hash navigation keeps the SPA (and its cached preferences) alive, so reload
  // to pick up the reset filter preferences.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.api));
  return accountId;
}

const drawer = (page: Page) => page.locator('[data-slot="drawer-popup"]');
const cards = (page: Page) => page.locator('[data-slot="transaction-card"]');

test.describe("phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("card tap opens details; the cleared control does not", async ({
    page,
  }) => {
    const accountId = await seedTransactions(page);
    await page.goto(`/#/accounts/${accountId}`);

    await expect(cards(page)).toHaveCount(2);

    const clear = page.getByLabel("Mark Supermarket cleared").locator("visible=true");
    await clear.tap();
    await expect(drawer(page)).toHaveCount(0);
    await expect(clear).toBeChecked();

    await page
      .getByRole("button", { name: "Supermarket", exact: true })
      .locator("visible=true")
      .tap();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByText("Transaction Details")).toBeVisible();
  });

  test("More menu shows Reconcile, Forecast and Edit account", async ({
    page,
  }) => {
    const accountId = await seedTransactions(page);
    await page.goto(`/#/accounts/${accountId}`);

    await page
      .getByRole("button", { name: "More actions", exact: true })
      .tap();
    const menu = page.locator('[data-slot="dropdown-menu-content"]');
    await expect(menu.getByText("Reconcile")).toBeVisible();
    await expect(menu.getByText("Forecast")).toBeVisible();
    await expect(menu.getByText("Edit account")).toBeVisible();
  });

  test("Filter popover toggles hide cleared and updates the summary", async ({
    page,
  }) => {
    const accountId = await seedTransactions(page);
    await page.goto(`/#/accounts/${accountId}`);

    const filterButton = page.getByRole("button", {
      name: "Filter transactions",
    });
    await expect(filterButton).toContainText("Filter");
    await filterButton.tap();
    const clearedCheckbox = page.getByLabel("Hide cleared");
    await expect(clearedCheckbox).toBeVisible();
    await clearedCheckbox.click();
    await expect(clearedCheckbox).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(clearedCheckbox).toBeHidden();
    const activeFilter = page.getByRole("button", {
      name: "Filter transactions, Hiding cleared",
    });
    await expect(activeFilter).toBeVisible();
    await expect(activeFilter.getByText("· 1")).toBeVisible();
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const accountId = await seedTransactions(page);
    await page.goto(`/#/accounts/${accountId}`);
    await expect(cards(page)).toHaveCount(2);

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("aligned amounts, direct actions, details dialog and pencil edit", async ({
    page,
  }) => {
    const accountId = await seedTransactions(page);
    await page.goto(`/#/accounts/${accountId}`);

    await expect(cards(page)).toHaveCount(2);

    const edges = await page
      .locator('[data-slot="transaction-amount"]')
      .evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().right)),
      );
    expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(1);

    // Direct desktop actions remain visible instead of collapsing into More.
    await expect(
      page.getByRole("button", { name: "Reconcile", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Forecast", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Import", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "More actions", exact: true }),
    ).toBeHidden();

    await page
      .getByRole("button", { name: "Supermarket", exact: true })
      .locator("visible=true")
      .click();
    const detailsDialog = page.getByRole("dialog");
    await expect(detailsDialog).toBeVisible();
    await expect(detailsDialog.getByText("Transaction Details")).toBeVisible();
    await detailsDialog
      .locator('[data-slot="dialog-footer"]')
      .getByRole("button", { name: "Close" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page
      .getByRole("button", { name: "Edit Supermarket" })
      .locator("visible=true")
      .click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Edit Transaction")).toBeVisible();
  });
});
