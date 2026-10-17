import { expect, test, type Page } from "@playwright/test";

// Synthetic data only.
const LONG_PAYEE =
  "Independent Neighbourhood Hardware and Garden Supplies Cooperative";
const MEMO =
  "Annual boiler service including flue gas analysis, a full system flush and replacement of the pressure relief valve.";

async function seedForecast(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  const accountId = await page.evaluate(
    async ({ longPayee, memo }) => {
      const [account = null] = await window.api.createAccount({
        name: `Forecast e2e ${Date.now()}`,
        number: null,
        type: "bank",
        balance: 1000,
        currency: "GBP",
        notes: null,
        interestRate: null,
        creditLimit: null,
        pendingReconcileBalance: null,
        pendingReconcileDate: null,
      });
      if (!account) throw new Error("Account was not created");
      const offset = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const [category = null] = await window.api.createCategory({
        name: "Home maintenance",
        parentId: null,
        expenseType: "expense",
      });
      const future = (
        payee: string,
        amount: number,
        days: number,
        notes: string | null = null,
        categoryId: number | null = null,
      ) =>
        window.api.createTransaction({
          accountId: account.id,
          date: offset(days),
          payee,
          amount,
          categoryId,
          notes,
          cleared: false,
        });
      await future("Boiler service", -250, 2, memo, category?.id ?? null);
      await future(longPayee, -1234567.89, 4);
      await future("Refund", 80, 6);
      await window.api.createScheduledTransaction({
        accountId: account.id,
        categoryId: null,
        transferToAccountId: null,
        payee: "Netflix",
        amount: -12.99,
        rrule: "FREQ=MONTHLY",
        nextDueDate: offset(3),
        autoPost: false,
        daysInAdvance: null,
        notes: null,
        active: true,
      });
      return account.id;
    },
    { longPayee: LONG_PAYEE, memo: MEMO },
  );
  return accountId;
}

const cards = (page: Page) => page.locator('[data-slot="forecast-card"]');
const card = (page: Page, payee: string) =>
  cards(page).filter({ hasText: payee }).first();
const controls = (page: Page) =>
  page.locator('[data-slot="forecast-controls"]');
// Exclude nested confirmations; they are also drawer-popups.
const drawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"]:not([data-nested])');

async function overflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function expectHitTarget(
  locator: ReturnType<Page["locator"]>,
  label: string,
) {
  const box = await locator.boundingBox();
  expect(box, label).not.toBeNull();
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(43.5);
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(43.5);
}

async function transactionsSnapshot(page: Page, accountId: number) {
  return page.evaluate(
    async (id) =>
      JSON.stringify(await window.api.getTransactionsByAccount(id)),
    accountId,
  );
}

test.describe("forecast on a phone (390x844)", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("whole card toggles once; details are separate; nothing real changes", async ({
    page,
  }) => {
    const accountId = await seedForecast(page);
    await page.goto(`/#/forecast/${accountId}`);
    await expect(card(page, "Boiler service")).toBeVisible();
    const before = await transactionsSnapshot(page, accountId);

    const boiler = card(page, "Boiler service");
    const checkbox = boiler.locator('input[type="checkbox"]');
    await expect(checkbox).toBeChecked();
    await expect(boiler).toContainText("Included");
    await expect(boiler).toContainText("Projected balance");

    // Tap an empty part of the card, away from the payee text and Details.
    const box = (await boiler.boundingBox())!;
    await boiler.tap({ position: { x: 100, y: box.height - 6 } });
    await expect(checkbox).not.toBeChecked();
    await expect(boiler).toHaveAttribute("data-included", "false");
    await expect(boiler).toContainText("Excluded from forecast");
    // The next included card's projected balance no longer includes it.
    await boiler.getByText("Boiler service").tap();
    await expect(checkbox).toBeChecked();

    // Details never toggles and opens a read-only drawer without a keyboard.
    const detailsButton = boiler.getByRole("button", {
      name: "Details for Boiler service",
    });
    await expectHitTarget(detailsButton, "details");
    await detailsButton.tap();
    await expect(checkbox).toBeChecked();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page)).toContainText(MEMO);
    await expect(drawer(page)).toContainText("Home maintenance");
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toMatch(/INPUT|TEXTAREA/);
    await drawer(page).getByRole("button", { name: "Close" }).tap();
    await expect(drawer(page)).toHaveCount(0);
    await expect(detailsButton).toBeFocused();

    expect(await transactionsSnapshot(page, accountId)).toBe(before);
  });

  test("Refresh resets inclusions explicitly", async ({ page }) => {
    const accountId = await seedForecast(page);
    await page.goto(`/#/forecast/${accountId}`);
    const refund = card(page, "Refund");
    await refund.getByText("Refund").tap();
    await expect(refund.getByRole("checkbox")).not.toBeChecked();
    await controls(page).getByRole("button", { name: "Refresh" }).tap();
    await expect(refund.getByRole("checkbox")).toBeChecked();
  });

  test("one scroller, sticky controls with 44px targets, last card reachable", async ({
    page,
  }) => {
    const accountId = await seedForecast(page);
    await page.goto(`/#/forecast/${accountId}`);
    await expect(cards(page).first()).toBeVisible();

    const bar = controls(page);
    expect(
      await bar.evaluate((el) => getComputedStyle(el).position),
    ).toBe("sticky");
    const viewport = page.viewportSize()!;
    const barBox = (await bar.boundingBox())!;
    // Pinned to the bottom of the viewport before any scrolling.
    expect(Math.abs(barBox.y + barBox.height - viewport.height)).toBeLessThan(
      1.5,
    );

    await expectHitTarget(bar.getByRole("button", { name: "Help" }), "help");
    await expectHitTarget(
      bar.getByRole("button", { name: "Refresh" }),
      "refresh",
    );
    await expectHitTarget(
      bar.getByRole("button", { name: /\d{2}\/\d{2}\/\d{4}/ }),
      "end date",
    );

    // Only <main> scrolls: no nested overflow scroller inside the page.
    const nested = await page.evaluate(() =>
      [...document.querySelectorAll("main *")].filter((el) => {
        const style = getComputedStyle(el);
        return (
          /(auto|scroll)/.test(style.overflowY) &&
          el.scrollHeight > el.clientHeight + 1
        );
      }).length,
    );
    expect(nested).toBe(0);

    const last = cards(page).last();
    await last.scrollIntoViewIfNeeded();
    await page.locator("main").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const lastBox = (await last.boundingBox())!;
    const barAfter = (await bar.boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barAfter.y + 1);
  });

  test("help is a content-sized information drawer", async ({ page }) => {
    const accountId = await seedForecast(page);
    await page.goto(`/#/forecast/${accountId}`);
    await controls(page).getByRole("button", { name: "Help" }).tap();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page)).toContainText("Forecast Help");
    await expect(
      drawer(page).getByRole("button", { name: "Close" }),
    ).toBeFocused();
    const height = (await drawer(page).boundingBox())!.height;
    expect(height).toBeLessThan(844 * 0.9);
    await drawer(page).getByRole("button", { name: "Close" }).tap();
    await expect(drawer(page)).toHaveCount(0);
  });

  test("320px: no horizontal overflow with a long payee and huge amount", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const accountId = await seedForecast(page);
    await page.goto(`/#/forecast/${accountId}`);
    await expect(card(page, "Independent")).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // Amount never collides with the payee text or Details.
    const long = card(page, "Independent");
    const amount = (await long
      .locator('[data-slot="forecast-amount"]')
      .boundingBox())!;
    const payee = (await long.locator("label").boundingBox())!;
    const details = (await long
      .getByRole("button", { name: /Details for/ })
      .boundingBox())!;
    expect(payee.x + payee.width).toBeLessThanOrEqual(amount.x + 1);
    expect(details.y).toBeGreaterThanOrEqual(amount.y + amount.height - 1);

    // End date + Refresh share one compact row with Help (no tall wrap).
    expect((await controls(page).boundingBox())!.height).toBeLessThanOrEqual(80);

    await controls(page).getByRole("button", { name: "Help" }).tap();
    await expect(drawer(page)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe("forecast in short landscape (844x390)", () => {
  test.use({ hasTouch: true, viewport: { width: 844, height: 390 } });

  test("controls stay compact and the list scrolls clear of them", async ({
    page,
  }) => {
    const accountId = await seedForecast(page);
    await page.goto(`/#/forecast/${accountId}`);
    await expect(cards(page).first()).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    const bar = controls(page);
    const barBox = (await bar.boundingBox())!;
    expect(barBox.height).toBeLessThanOrEqual(80);
    expect(Math.abs(barBox.y + barBox.height - 390)).toBeLessThan(1.5);

    await page.locator("main").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const last = (await cards(page).last().boundingBox())!;
    const after = (await bar.boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(after.y + 1);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe("forecast on desktop (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("aligned columns, inline balance and a details dialog", async ({
    page,
  }) => {
    const accountId = await seedForecast(page);
    await page.goto(`/#/forecast/${accountId}`);
    await expect(cards(page).first()).toBeVisible();

    const rights = await cards(page).evaluateAll((els) =>
      els.map((el) => {
        const amount = el.querySelector('[data-slot="forecast-amount"]')!;
        return Math.round(amount.getBoundingClientRect().right);
      }),
    );
    expect(new Set(rights).size).toBe(1);
    expect(await overflow(page)).toBeLessThanOrEqual(1);

    // Single-row desktop cards centre their contents vertically.
    const offsets = await cards(page).evaluateAll((els) =>
      els.map((card) => {
        const box = card.getBoundingClientRect();
        const amount = card
          .querySelector('[data-slot="forecast-amount"]')!
          .getBoundingClientRect();
        return Math.abs(
          amount.top + amount.height / 2 - (box.top + box.height / 2),
        );
      }),
    );
    expect(Math.max(...offsets)).toBeLessThanOrEqual(1);

    const boiler = card(page, "Boiler service");
    await boiler.locator("label").click();
    await expect(boiler).toContainText("Excluded from forecast");
    await boiler.getByRole("button", { name: "Details for Boiler service" }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(MEMO);
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(dialog).toHaveCount(0);

    await controls(page).getByRole("button", { name: "Help" }).click();
    await expect(dialog).toContainText("Forecast Help");
  });
});
