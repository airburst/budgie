import { expect, test, type Page } from "@playwright/test";

// Synthetic data only.
async function seedReports(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  await page.evaluate(async () => {
    const [account = null] = await window.api.createAccount({
      name: `Reports e2e ${Date.now()}`,
      number: null,
      type: "bank",
      balance: 500,
      currency: "GBP",
      notes: null,
      interestRate: null,
      creditLimit: null,
      pendingReconcileBalance: null,
      pendingReconcileDate: null,
    });
    if (!account) throw new Error("Account was not created");
    const category = async (
      name: string,
      expenseType: "expense" | "income" | "transfer",
    ) => {
      const [row = null] = await window.api.createCategory({
        name,
        parentId: null,
        expenseType,
      });
      return row!.id;
    };
    const groceries = await category("Groceries", "expense");
    const rent = await category("Rent", "expense");
    const salary = await category("Salary", "income");
    for (let m = 0; m < 3; m++) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-03`;
      const make = (payee: string, amount: number, categoryId: number) =>
        window.api.createTransaction({
          accountId: account.id,
          date,
          payee,
          amount,
          categoryId,
          notes: null,
          cleared: true,
        });
      await make("Tesco", -200, groceries);
      await make("Landlord", -700, rent);
      await make("Employer", 2400, salary);
    }
  });
  await page.goto("/#/reports");
  await page.reload();
  await expect(
    page.getByText("Spending by Category", { exact: true }),
  ).toBeVisible();
}

async function overflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

const filters = (page: Page) =>
  page.getByRole("group", { name: "Report filters" });
const chartCard = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: title }).first();

test.describe("reports on a phone (390x844)", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("time-series charts are tall enough to scrub and keep horizontal drags", async ({
    page,
  }) => {
    await seedReports(page);
    for (const title of [
      "Net worth over time",
      "Income versus expenses by month",
    ]) {
      const chart = page.locator(`svg[aria-label="${title}"]`);
      await chart.scrollIntoViewIfNeeded();
      const box = (await chart.boundingBox())!;
      // 2:1 charts were ~170px tall here; a finger needs more to scrub.
      expect(box.height, title).toBeGreaterThanOrEqual(240);
      // pan-y: vertical swipes scroll, horizontal drags stay on the chart.
      const touchAction = await chart.evaluate((el) => {
        let node: Element | null = el;
        while (node) {
          const value = getComputedStyle(node).touchAction;
          if (value !== "auto") return value;
          node = node.parentElement;
        }
        return "auto";
      });
      expect(touchAction, title).toBe("pan-y");
    }
  });

  test("controls sit under the header bar and meet 44px targets", async ({
    page,
  }) => {
    await seedReports(page);
    // The header bar carries the title; the h1 stays for screen readers only.
    await expect(
      page
        .locator("header")
        .getByText("Reports", { exact: true })
        .locator("visible=true"),
    ).toBeVisible();
    expect(
      (await page
        .getByRole("heading", { name: "Reports", exact: true })
        .boundingBox())!.width,
    ).toBeLessThanOrEqual(1);
    const header = (await page.locator("header").boundingBox())!;
    const group = (await filters(page).boundingBox())!;
    expect(group.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    expect(group.x + group.width).toBeLessThanOrEqual(390);
    for (const control of [
      filters(page).getByRole("combobox", { name: "Date range" }),
      filters(page).locator('[data-slot="input-group"]'),
    ]) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(
        43.5,
      );
    }
    // The visible label names the preset rather than its raw value.
    await expect(filters(page)).toContainText("Last 90 Days");
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("charts stack at base width with tap-accessible values", async ({
    page,
  }) => {
    await seedReports(page);
    const spending = (await chartCard(
      page,
      "Spending by Category",
    ).boundingBox())!;
    const income = (await chartCard(page, "Income vs Expenses").boundingBox())!;
    const worth = (await chartCard(page, "Net Worth Trend").boundingBox())!;
    expect(Math.abs(spending.x - income.x)).toBeLessThan(1);
    expect(Math.abs(spending.width - income.width)).toBeLessThan(1);
    expect(income.y).toBeGreaterThanOrEqual(spending.y + spending.height - 1);
    expect(worth.y).toBeGreaterThanOrEqual(income.y + income.height - 1);

    const incomeCard = chartCard(page, "Income vs Expenses");
    const trigger = incomeCard.getByRole("button", { name: /show values/i });
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await expect(incomeCard.getByRole("list", { name: /values/ })).toHaveCount(
      0,
    );
    await trigger.tap();
    const list = incomeCard.getByRole("list", {
      name: "Income versus expenses values",
    });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list).toContainText("Income £2,400.00");
    await expect(list).toContainText("Expenses £900.00");

    // Keyboard: Enter on the focused disclosure toggles it.
    const worthCard = chartCard(page, "Net Worth Trend");
    await worthCard.getByRole("button", { name: /show values/i }).focus();
    await page.keyboard.press("Enter");
    await expect(
      worthCard.getByRole("list", { name: "Net worth values" }),
    ).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("320px: no horizontal overflow, even with values open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await seedReports(page);
    for (const card of [
      "Spending by Category",
      "Income vs Expenses",
      "Net Worth Trend",
    ]) {
      await chartCard(page, card)
        .getByRole("button", { name: /show values/i })
        .click();
    }
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe("reports on desktop (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("keeps the multi-column composition", async ({ page }) => {
    await seedReports(page);
    const heading = (await page
      .getByRole("heading", { name: "Reports", exact: true })
      .boundingBox())!;
    const group = (await filters(page).boundingBox())!;
    // Heading and controls share a row on desktop.
    expect(
      Math.abs(group.y + group.height / 2 - (heading.y + heading.height / 2)),
    ).toBeLessThan(30);
    const spending = (await chartCard(
      page,
      "Spending by Category",
    ).boundingBox())!;
    const income = (await chartCard(page, "Income vs Expenses").boundingBox())!;
    expect(Math.abs(spending.y - income.y)).toBeLessThan(1);
    expect(income.x).toBeGreaterThan(spending.x + spending.width - 1);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});
