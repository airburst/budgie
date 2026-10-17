import { expect, test, type Page } from "@playwright/test";

// Synthetic data only. The statement balance is deliberately unreachable so
// auto-match leaves every card unselected at the start of each test.
const LONG_PAYEE =
  "Independent Neighbourhood Hardware and Garden Supplies Cooperative";

async function seedReconcile(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  const accountId = await page.evaluate(async (longPayee) => {
    const [account = null] = await window.api.createAccount({
      name: `Reconcile cards ${Date.now()}`,
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
    const make = (
      payee: string,
      amount: number,
      notes: string | null = null,
    ) =>
      window.api.createTransaction({
        accountId: account.id,
        date: today,
        payee,
        amount,
        categoryId: null,
        notes,
        cleared: false,
      });
    await make("Supermarket", -42.8, "Weekly shop and household essentials.");
    await make("Salary", 2104.5);
    await make(longPayee, -1234567.89);
    return account.id;
  }, LONG_PAYEE);
  return accountId;
}

function reconcileUrl(accountId: number) {
  const today = new Date().toISOString().slice(0, 10);
  return `/#/reconcile/${accountId}?date=${today}&balance=7777`;
}

async function clearedState(page: Page, accountId: number) {
  return page.evaluate(async (id) => {
    const txs = await window.api.getTransactionsByAccount(id);
    return Object.fromEntries(txs.map((t) => [t.payee, Boolean(t.cleared)]));
  }, accountId);
}

const drawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"]:not([data-nested])');
const cards = (page: Page) => page.locator('[data-slot="reconcile-card"]');
const card = (page: Page, payee: string) =>
  cards(page).filter({ hasText: payee });
const checkbox = (page: Page, name: string) =>
  page.getByRole("checkbox", { name, exact: true });
const taskBar = (page: Page) =>
  page.locator('[data-slot="reconcile-task-bar"]');

test.describe("phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("summary is two-by-two", async ({ page }) => {
    const accountId = await seedReconcile(page);
    await page.goto(reconcileUrl(accountId));
    await expect(cards(page)).toHaveCount(3);

    const tiles = page.locator(
      '[data-slot="reconcile-summary"] > div:visible',
    );
    await expect(tiles).toHaveCount(4);
    const boxes = await tiles.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width };
      }),
    );
    expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[2]!.y - boxes[3]!.y)).toBeLessThanOrEqual(1);
    expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + 20);
    expect(Math.abs(boxes[0]!.x - boxes[2]!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes[0]!.w - boxes[1]!.w)).toBeLessThanOrEqual(1);
  });

  test("whole-card tap toggles selection exactly once; Edit does not", async ({
    page,
  }) => {
    const accountId = await seedReconcile(page);
    await page.goto(reconcileUrl(accountId));
    await expect(cards(page)).toHaveCount(3);

    const salary = card(page, "Salary");
    await expect(salary.getByText("Selected")).toHaveCount(0);
    await expect(taskBar(page)).toContainText("0 selected");

    // Tap the middle of the card (not the checkbox or Edit button).
    await salary.tap();
    await expect(checkbox(page, "Salary")).toBeChecked();
    await expect(salary.getByText("Selected")).toBeVisible();
    await expect(taskBar(page)).toContainText("1 selected");
    // A double toggle would settle back to unchecked; give it time to.
    await page.waitForTimeout(400);
    await expect(checkbox(page, "Salary")).toBeChecked();
    expect((await clearedState(page, accountId)).Salary).toBe(true);

    // Tapping again unselects, again exactly once.
    await salary.tap();
    await expect(checkbox(page, "Salary")).not.toBeChecked();
    await page.waitForTimeout(400);
    await expect(checkbox(page, "Salary")).not.toBeChecked();
    expect((await clearedState(page, accountId)).Salary).toBe(false);

    // Edit opens the editor and leaves selection alone.
    await page.getByRole("button", { name: "Edit Supermarket" }).tap();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByText("Edit Transaction")).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("INPUT");
    await expect(taskBar(page)).toContainText("0 selected");
    expect((await clearedState(page, accountId)).Supermarket).toBe(false);
  });

  test("44px targets, no collisions and the Finish guard", async ({ page }) => {
    const accountId = await seedReconcile(page);
    await page.goto(reconcileUrl(accountId));
    await expect(cards(page)).toHaveCount(3);

    for (const locator of [
      page.getByRole("button", { name: "Edit Salary" }),
      page.getByRole("button", { name: "Cancel" }),
      page.getByRole("button", { name: "Finish" }),
      page.getByRole("button", { name: "Auto Balance" }),
      page.getByRole("button", { name: "Add Transaction" }),
    ]) {
      const box = await locator.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    for (const el of await cards(page).all()) {
      expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }

    // Amount never overlaps the payee text or the Edit button.
    const salary = card(page, "Salary");
    const amount = await salary
      .locator('[data-slot="reconcile-amount"]')
      .boundingBox();
    const edit = await salary
      .getByRole("button", { name: "Edit Salary" })
      .boundingBox();
    expect(amount!.y + amount!.height).toBeLessThanOrEqual(edit!.y + 1);

    await expect(page.getByRole("button", { name: "Finish" })).toBeDisabled();
    await salary.tap();
    await expect(page.getByRole("button", { name: "Finish" })).toBeDisabled();
  });

  test("the last card scrolls clear of the fixed task bar", async ({
    page,
  }) => {
    const accountId = await seedReconcile(page);
    await page.setViewportSize({ width: 390, height: 520 });
    await page.goto(reconcileUrl(accountId));
    await expect(cards(page)).toHaveCount(3);

    await expect(taskBar(page)).toBeVisible();
    const barBox = await taskBar(page).boundingBox();
    expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(520 + 1);

    await cards(page).last().scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const main = document.querySelector(".app-main");
      main?.scrollTo(0, main.scrollHeight);
    });
    const last = await cards(page).last().boundingBox();
    expect(last!.y + last!.height).toBeLessThanOrEqual(barBox!.y);
  });

  test("no horizontal overflow at 320px with long payee and amount", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const accountId = await seedReconcile(page);
    await page.goto(reconcileUrl(accountId));
    await expect(cards(page)).toHaveCount(3);
    await card(page, "Independent Neighbourhood").tap();
    await expect(taskBar(page)).toContainText("1 selected");

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
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("aligned columns, one summary row, click toggles once", async ({
    page,
  }) => {
    const accountId = await seedReconcile(page);
    await page.goto(reconcileUrl(accountId));
    await expect(cards(page)).toHaveCount(3);

    const edges = await page
      .locator('[data-slot="reconcile-amount"]')
      .evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().right)),
      );
    expect(Math.max(...edges) - Math.min(...edges)).toBeLessThanOrEqual(1);

    const tiles = page.locator(
      '[data-slot="reconcile-summary"] > div:visible',
    );
    const tops = await tiles.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().y)),
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);

    const supermarket = card(page, "Supermarket");
    await supermarket.click();
    await expect(checkbox(page, "Supermarket")).toBeChecked();
    await page.waitForTimeout(400);
    await expect(checkbox(page, "Supermarket")).toBeChecked();
    expect((await clearedState(page, accountId)).Supermarket).toBe(true);

    await page.getByRole("button", { name: "Edit Supermarket" }).click();
    await expect(
      page.locator('[data-slot="dialog-content"]').getByText("Edit Transaction"),
    ).toBeVisible();
  });
});
