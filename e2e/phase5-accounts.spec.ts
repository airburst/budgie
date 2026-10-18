import { expect, test, type Page } from "@playwright/test";

type Seeded = { bankId: number; cardId: number };

async function seedAccounts(page: Page): Promise<Seeded> {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  return page.evaluate(async () => {
    const make = async (
      name: string,
      type: "bank" | "credit_card",
      balance: number,
      creditLimit: number | null,
      number: string | null,
    ) => {
      const [account = null] = await window.api.createAccount({
        name,
        number,
        type,
        balance,
        currency: "GBP",
        notes: null,
        interestRate: null,
        creditLimit,
        pendingReconcileBalance: null,
        pendingReconcileDate: null,
      });
      if (!account) throw new Error(`${name} was not created`);
      return account.id;
    };
    const bankId = await make(
      "Joint Household Current Account",
      "bank",
      4285.6,
      null,
      "40112212344821",
    );
    const cardId = await make("Credit Card", "credit_card", -1250, 5000, null);
    return { bankId, cardId };
  });
}

const drawer = (page: Page) => page.locator('[data-slot="drawer-popup"]');
const cards = (page: Page) => page.locator('[data-slot="account-card"]');

async function balanceRightEdges(page: Page) {
  return page
    .locator('[data-slot="account-card"] [data-slot="account-balance"]')
    .evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().right)),
    );
}

test.describe("phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("account cards navigate on tap; the menu does not", async ({ page }) => {
    const { bankId, cardId } = await seedAccounts(page);
    await page.goto("/#/");

    await expect(cards(page)).toHaveCount(2);
    await expect(page.getByRole("navigation", { name: "Accounts" })).toBeHidden();

    const card = cards(page).filter({ hasText: "Credit Card" });
    await expect(
      card.getByText(/^Remaining credit £/).locator("visible=true"),
    ).toHaveCount(1);
    await expect(
      cards(page)
        .filter({ hasText: "Joint Household" })
        .getByText("Remaining credit"),
    ).toHaveCount(0);

    const edges = await balanceRightEdges(page);
    expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(1);

    const menu = card.getByRole("button", {
      name: "More actions for Credit Card",
    });
    const menuBox = await menu.boundingBox();
    expect(menuBox!.width).toBeGreaterThanOrEqual(44);
    expect(menuBox!.height).toBeGreaterThanOrEqual(44);
    await menu.tap();
    await page.getByRole("menuitem", { name: "Edit account" }).tap();
    await expect(drawer(page).getByText("Edit Account")).toBeVisible();
    expect(page.url()).toMatch(/#\/$/);
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("INPUT");
    await drawer(page).getByRole("button", { name: "Cancel" }).tap();
    await expect(drawer(page)).toBeHidden();

    // Tapping anywhere else on the card (here: the balance) navigates.
    // The stretched link covers the cell, so tap its coordinates directly.
    const balance = await card
      .locator('[data-slot="account-balance"]')
      .boundingBox();
    await page.touchscreen.tap(
      balance!.x + balance!.width / 2,
      balance!.y + balance!.height / 2,
    );
    await expect(page).toHaveURL(new RegExp(`#/accounts/${cardId}$`));
    expect(bankId).not.toBe(cardId);
  });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const { bankId } = await seedAccounts(page);
    for (const path of ["/#/", `/#/accounts/${bankId}`]) {
      await page.goto(path);
      await expect(
        page
          .getByText("Joint Household Current Account")
          .locator("visible=true")
          .first(),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("selected-account card switches account through the drawer", async ({
    page,
  }) => {
    const { bankId, cardId } = await seedAccounts(page);
    await page.goto(`/#/accounts/${bankId}`);

    const context = page.getByRole("region", {
      name: "Joint Household Current Account",
    });
    await expect(context.getByText("Selected account")).toBeVisible();
    await expect(context.getByText("Bank · •• 4821")).toBeVisible();

    await context.getByRole("button", { name: "Change account" }).tap();
    await expect(drawer(page).getByText("Choose the account to view.")).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("INPUT");
    await expect(
      drawer(page).getByRole("button", { name: /Joint Household/ }),
    ).toHaveAttribute("aria-current", "true");

    await drawer(page).getByRole("button", { name: "Close" }).tap();
    await expect(drawer(page)).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`#/accounts/${bankId}$`));

    await context.getByRole("button", { name: "Change account" }).tap();
    await drawer(page).getByRole("button", { name: /Credit Card/ }).tap();
    await expect(page).toHaveURL(new RegExp(`#/accounts/${cardId}$`));
    await expect(
      page.getByRole("region", { name: "Credit Card" }),
    ).toBeVisible();
  });

  test("account type select opens above the add-account drawer", async ({
    page,
  }) => {
    await seedAccounts(page);
    await page.goto("/#/");
    await page.getByRole("button", { name: "Add account" }).first().tap();
    await expect(
      drawer(page).getByRole("heading", { name: "New Account" }),
    ).toBeVisible();
    await drawer(page).getByRole("combobox").first().tap();
    const option = page.getByRole("option", { name: "Credit Card" });
    await expect(option).toBeVisible();
    await option.tap();
    await expect(drawer(page).getByLabel("Credit Limit")).toBeVisible();
  });
});

test("tablet: chooser is a popover, sidebar hidden", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  const { bankId, cardId } = await seedAccounts(page);
  await page.goto(`/#/accounts/${bankId}`);

  await expect(page.getByRole("navigation", { name: "Accounts" })).toBeHidden();
  await page.getByRole("button", { name: "Change account" }).click();
  await expect(drawer(page)).toHaveCount(0);
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: /Credit Card/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/accounts/${cardId}$`));
});

test("desktop: sidebar replaces the context card; columns align", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { bankId } = await seedAccounts(page);
  await page.goto("/#/");

  await expect(page.getByRole("navigation", { name: "Accounts" })).toBeVisible();
  const edges = await balanceRightEdges(page);
  expect(edges).toHaveLength(2);
  expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("button", { name: "Edit Credit Card" }),
  ).toBeVisible();

  await page.goto(`/#/accounts/${bankId}`);
  await expect(page.getByRole("navigation", { name: "Accounts" })).toBeVisible();
  await expect(page.getByText("Selected account")).toBeHidden();
});
