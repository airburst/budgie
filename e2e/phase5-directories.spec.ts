import { expect, test, type Page } from "@playwright/test";

// Synthetic data only.
const LONG_CATEGORY =
  "Household maintenance, repairs and seasonal garden equipment";

async function seedDirectories(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  await page.evaluate(async (longCategory) => {
    // Fresh profiles ship default categories; clear them (children first,
    // transfer left alone) so counts below are about the synthetic data only.
    const existing = await window.api.getCategories();
    for (const c of existing.filter(
      (c) => c.parentId !== null && c.expenseType !== "transfer",
    )) {
      await window.api.deleteCategory(c.id);
    }
    for (const c of existing.filter(
      (c) => c.parentId === null && c.expenseType !== "transfer",
    )) {
      await window.api.deleteCategory(c.id);
    }
    const make = async (
      name: string,
      expenseType: "expense" | "income",
      parentId: number | null,
    ) => {
      const [created = null] = await window.api.createCategory({
        name,
        expenseType,
        parentId,
      });
      if (!created) throw new Error(`${name} was not created`);
      return created.id;
    };
    const groceries = await make("Groceries", "expense", null);
    await make("Snacks", "expense", groceries);
    await make("Salary", "income", null);
    const home = await make(longCategory, "expense", null);
    await make("Fixtures", "expense", home);

    await window.api.createPayee({
      name: "Corner Shop",
      categoryId: groceries,
      amount: -12.5,
    });
    await window.api.createPayee({
      name: "Wages Ltd",
      categoryId: null,
      amount: 1500,
    });
    await window.api.createPayee({
      name: "Independent Neighbourhood Hardware and Garden Supplies Cooperative",
      categoryId: home,
      amount: -1234567.89,
    });
  }, LONG_CATEGORY);
}

const drawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"]:not([data-nested])');
const confirmDrawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"]');
const categoryCards = (page: Page) =>
  page.locator('[data-slot="category-card"]');
const payeeCards = (page: Page) => page.locator('[data-slot="payee-card"]');

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  expect(
    await page.evaluate(() => {
      const main = document.querySelector(".app-main")!;
      return main.scrollWidth - main.clientWidth;
    }),
  ).toBeLessThanOrEqual(0);
}

test.describe("categories on phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("hierarchy, details with explicit Edit, labelled menu", async ({
    page,
  }) => {
    await seedDirectories(page);
    await page.goto("/#/categories");
    await expect(categoryCards(page)).toHaveCount(5);

    // Children follow their parent, indented, with visible parent context.
    const snacks = categoryCards(page).filter({ hasText: "Snacks" });
    await expect(snacks).toHaveAttribute("data-child", "true");
    await expect(
      snacks.getByText(/Sub-category of Groceries/).locator("visible=true"),
    ).toBeVisible();
    const groceries = await categoryCards(page)
      .filter({ hasText: /^Groceries/ })
      .boundingBox();
    const snacksBox = await snacks.boundingBox();
    expect(snacksBox!.x).toBeGreaterThan(groceries!.x + 8);
    expect(snacksBox!.y).toBeGreaterThan(groceries!.y);

    // Tap opens read-only details, then Edit is a deliberate second step.
    await snacks.tap();
    await expect(drawer(page).getByText("Category details")).toBeVisible();
    await expect(drawer(page).locator("input")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("INPUT");
    await drawer(page).getByRole("button", { name: "Edit" }).tap();
    await expect(drawer(page).getByText("Edit Category")).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("INPUT");
    await drawer(page).getByRole("button", { name: "Cancel" }).tap();
    await expect(drawer(page)).toBeHidden();

    // The ••• menu holds the labelled actions and is a 44px target.
    const menu = page.getByRole("button", { name: "More actions for Groceries" });
    const box = await menu.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await menu.tap();
    await expect(
      page.getByRole("menuitem", { name: "Add sub-category" }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Delete \(remove sub-categories first\)/ }),
    ).toBeDisabled();
    await page.getByRole("menuitem", { name: "Add sub-category" }).tap();
    await expect(drawer(page).getByText("New Sub-category")).toBeVisible();
    await expect(drawer(page).getByText("Parent category")).toBeVisible();
  });

  test("delete is confirmed; Cancel keeps the category", async ({ page }) => {
    await seedDirectories(page);
    await page.goto("/#/categories");
    await expect(categoryCards(page)).toHaveCount(5);

    const openDelete = async () => {
      await page
        .getByRole("button", { name: "More actions for Salary" })
        .tap();
      await page.getByRole("menuitem", { name: "Delete" }).tap();
      await expect(confirmDrawer(page).getByText("Delete category?")).toBeVisible();
    };

    await openDelete();
    const cancel = confirmDrawer(page).getByRole("button", { name: "Cancel" });
    await expect(cancel).toBeFocused();
    await cancel.tap();
    await expect(confirmDrawer(page)).toBeHidden();
    await expect(categoryCards(page)).toHaveCount(5);

    await openDelete();
    await confirmDrawer(page).getByRole("button", { name: "Delete" }).tap();
    await expect(categoryCards(page)).toHaveCount(4);
    await expect(
      categoryCards(page).filter({ hasText: "Salary" }),
    ).toHaveCount(0);
  });

  test("a dirty draft asks before discarding", async ({ page }) => {
    await seedDirectories(page);
    await page.goto("/#/categories");
    await page.getByRole("button", { name: "New Category" }).tap();
    await expect(drawer(page).getByText("New Category")).toBeVisible();
    await drawer(page).getByLabel("Name").fill("Pets");
    await drawer(page).getByRole("button", { name: "Cancel" }).tap();
    await expect(page.getByText("Discard changes?")).toBeVisible();
    await confirmDrawer(page)
      .getByRole("button", { name: "Cancel" })
      .last()
      .tap();
    await expect(drawer(page).getByLabel("Name")).toHaveValue("Pets");
    await drawer(page).getByRole("button", { name: "Create" }).tap();
    await expect(categoryCards(page)).toHaveCount(6);
  });

  test("no horizontal overflow at 320px with long names", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await seedDirectories(page);
    await page.goto("/#/categories");
    await expect(categoryCards(page)).toHaveCount(5);
    await noOverflow(page);
  });
});

test.describe("payees on phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("cards show category and amount; tap opens details then Edit", async ({
    page,
  }) => {
    await seedDirectories(page);
    await page.goto("/#/payees");
    await expect(payeeCards(page)).toHaveCount(3);

    const shop = payeeCards(page).filter({ hasText: "Corner Shop" });
    await expect(shop).toContainText("Groceries");
    await expect(shop).toContainText("−12.50");

    await shop.tap();
    await expect(drawer(page).getByText("Payee details")).toBeVisible();
    await expect(drawer(page).locator("input")).toHaveCount(0);
    await drawer(page).getByRole("button", { name: "Edit" }).tap();
    await expect(drawer(page).getByText("Edit Payee")).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("INPUT");
    await drawer(page).getByRole("button", { name: "Cancel" }).tap();
    await expect(drawer(page)).toBeHidden();
  });

  test("delete is confirmed via the menu", async ({ page }) => {
    await seedDirectories(page);
    await page.goto("/#/payees");
    await expect(payeeCards(page)).toHaveCount(3);

    const menu = page.getByRole("button", { name: "More actions for Wages Ltd" });
    const box = await menu.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await menu.tap();
    await page.getByRole("menuitem", { name: "Delete" }).tap();
    await expect(confirmDrawer(page).getByText("Delete payee?")).toBeVisible();
    await confirmDrawer(page).getByRole("button", { name: "Cancel" }).tap();
    await expect(payeeCards(page)).toHaveCount(3);

    await menu.tap();
    await page.getByRole("menuitem", { name: "Delete" }).tap();
    await confirmDrawer(page).getByRole("button", { name: "Delete" }).tap();
    await expect(payeeCards(page)).toHaveCount(2);
  });

  test("no horizontal overflow at 320px with long names and amounts", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await seedDirectories(page);
    await page.goto("/#/payees");
    await expect(payeeCards(page)).toHaveCount(3);
    await noOverflow(page);
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("category actions stay aligned across parent and child cards", async ({
    page,
  }) => {
    await seedDirectories(page);
    await page.goto("/#/categories");
    await expect(categoryCards(page)).toHaveCount(5);

    const rights = await categoryCards(page).evaluateAll((els) =>
      els.map((el) => {
        const buttons = el.querySelectorAll("button[aria-label^='Delete']");
        return Math.round(
          buttons[0]!.getBoundingClientRect().right,
        );
      }),
    );
    expect(Math.max(...rights) - Math.min(...rights)).toBeLessThanOrEqual(1);

    // Type column left edges line up as well.
    const typeLefts = await categoryCards(page).evaluateAll((els) =>
      els.map((el) => {
        const type = Array.from(el.querySelectorAll("p")).find((p) =>
          p.textContent?.startsWith("Type"),
        )!;
        return Math.round(type.getBoundingClientRect().left);
      }),
    );
    expect(Math.max(...typeLefts) - Math.min(...typeLefts)).toBeLessThanOrEqual(1);

    // Direct labelled actions; Add sub-category only on parents.
    await expect(
      page.getByRole("button", { name: "Add sub-category to Groceries" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add sub-category to Snacks" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Delete Groceries" }),
    ).toBeDisabled();

    await page.getByRole("button", { name: "Snacks", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Category details");
    await page.getByRole("dialog").getByRole("button", { name: "Edit" }).click();
    await expect(
      page.locator('[data-slot="dialog-content"]').getByText("Edit Category"),
    ).toBeVisible();
  });

  test("payee amounts align and actions are direct", async ({ page }) => {
    await seedDirectories(page);
    await page.goto("/#/payees");
    await expect(payeeCards(page)).toHaveCount(3);

    const edges = await page
      .locator('[data-slot="payee-amount"]')
      .evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().right)),
      );
    expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Edit Corner Shop" }).click();
    await expect(
      page.locator('[data-slot="dialog-content"]').getByText("Edit Payee"),
    ).toBeVisible();
  });
});
