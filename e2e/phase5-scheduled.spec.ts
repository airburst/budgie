import { expect, test, type Page } from "@playwright/test";

// Synthetic data only. Fixture: two accounts, four schedules.
//   Current: Netflix -12.99 (due +2d), Gym -30.00 (due +5d, paused)
//   Savings: Salary +2000.00 (due +3d), Rent -800.00 (due +4d)
// Active due-soon totals: Income £2,000.00, Outgoing £812.99.
async function seedSchedules(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  await page.evaluate(async () => {
    const make = async (name: string) => {
      const [account = null] = await window.api.createAccount({
        name,
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
    };
    const offset = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const current = await make("Current");
    const savings = await make("Savings");
    const schedule = (
      accountId: number,
      payee: string,
      amount: number,
      days: number,
      active = true,
      autoPost = false,
    ) =>
      window.api.createScheduledTransaction({
        accountId,
        categoryId: null,
        transferToAccountId: null,
        payee,
        amount,
        rrule: "FREQ=MONTHLY",
        nextDueDate: offset(days),
        autoPost,
        daysInAdvance: autoPost ? 2 : null,
        notes: null,
        active,
      });
    await schedule(current, "Netflix", -12.99, 2);
    await schedule(current, "Gym", -30, 5, false, true);
    await schedule(savings, "Salary", 2000, 3);
    await schedule(savings, "Rent", -800, 4);
  });
  await page.goto("/#/scheduled");
}

const cards = (page: Page) => page.locator('[data-slot="scheduled-card"]');
// Exclude nested confirmations; they are also drawer-popups.
const drawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"]:not([data-nested])');
const nextDue = (page: Page, payee: string) =>
  page.evaluate(
    async (name) =>
      (await window.api.getScheduledTransactions()).find(
        (s) => s.payee === name,
      )?.nextDueDate ?? null,
    payee,
  );
const transactionCount = (page: Page) =>
  page.evaluate(async () => (await window.api.getTransactions()).length);
const summary = (page: Page) => page.locator('[data-slot="scheduled-summary"]');

async function cardPayees(page: Page) {
  return cards(page).evaluateAll((els) =>
    els.map((el) => el.querySelector("button")?.textContent ?? ""),
  );
}

test.describe("phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("shows separate income and outgoing, never netted", async ({ page }) => {
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);
    await expect(summary(page).getByText("All accounts")).toBeVisible();
    await expect(
      summary(page).locator('[data-slot="summary-income"]'),
    ).toHaveText("£2,000.00");
    await expect(
      summary(page).locator('[data-slot="summary-outgoing"]'),
    ).toHaveText("£812.99");
    await expect(summary(page).getByText("3", { exact: true })).toBeVisible();
  });

  test("account filter scopes summary and list, labelled in text", async ({
    page,
  }) => {
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);
    await page
      .getByRole("button", { name: "Filter accounts, All accounts" })
      .tap();
    await page.getByLabel("Savings").check();
    await page.getByLabel("Savings").uncheck();
    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("button", { name: "Filter accounts, Current" }),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(2);
    await expect(summary(page).getByText("Current")).toBeVisible();
    await expect(
      summary(page).locator('[data-slot="summary-income"]'),
    ).toHaveText("£0.00");
    await expect(
      summary(page).locator('[data-slot="summary-outgoing"]'),
    ).toHaveText("£12.99");
  });

  test("calendar is collapsed on entry and toggles open", async ({ page }) => {
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);
    const calendar = page.getByLabel("Next due dates calendar");
    await expect(calendar).toHaveCount(0);

    await page.getByRole("button", { name: "Show calendar" }).tap();
    await expect(calendar).toBeVisible();
    await expect(
      calendar.getByRole("gridcell", { name: /payment due/ }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Hide calendar" }).tap();
    await expect(calendar).toHaveCount(0);
  });

  test("sort menu reorders the cards", async ({ page }) => {
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);
    expect(await cardPayees(page)).toEqual([
      "Netflix",
      "Salary",
      "Rent",
      "Gym",
    ]);

    await page.getByRole("button", { name: /^Sort: Next due/ }).tap();
    await page.getByRole("menuitemradio", { name: "Payee, Z to A" }).tap();
    await expect(
      page.getByRole("button", { name: /^Sort: Payee/ }),
    ).toBeVisible();
    expect(await cardPayees(page)).toEqual([
      "Salary",
      "Rent",
      "Netflix",
      "Gym",
    ]);

    await page.getByRole("button", { name: /^Sort: Payee/ }).tap();
    await page
      .getByRole("menuitemradio", { name: "Amount, lowest first" })
      .tap();
    expect(await cardPayees(page)).toEqual([
      "Rent",
      "Gym",
      "Netflix",
      "Salary",
    ]);
  });

  test("status is text and card actions are 44px targets", async ({ page }) => {
    await seedSchedules(page);
    const gym = cards(page).filter({ hasText: "Gym" });
    await expect(gym.getByText("Paused").locator("visible=true")).toBeVisible();
    await expect(gym.getByText("Auto-post 2 days ahead")).toBeVisible();

    for (const name of [
      "Record payment for Netflix",
      "Skip Netflix",
      "Edit Netflix",
      "Delete Netflix",
    ]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(43.5);
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
    }
  });

  test("card tap opens details; money is recorded only via the explicit action", async ({
    page,
  }) => {
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);

    await page.getByRole("button", { name: "Netflix", exact: true }).tap();
    await expect(drawer(page)).toBeVisible();
    await expect(
      drawer(page).getByText("Scheduled Payment Details"),
    ).toBeVisible();
    expect(await transactionCount(page)).toBe(0);
    await drawer(page).getByRole("button", { name: "Close" }).tap();
    await expect(drawer(page)).toHaveCount(0);

    // Record payment from the card opens a read-only confirmation first.
    await page
      .getByRole("button", { name: "Record payment for Netflix" })
      .tap();
    await expect(
      drawer(page).getByText("Nothing is recorded until you confirm."),
    ).toBeVisible();
    expect(await transactionCount(page)).toBe(0);
    await drawer(page).getByRole("button", { name: "Cancel" }).tap();
    await expect(drawer(page)).toHaveCount(0);
    expect(await transactionCount(page)).toBe(0);

    await page
      .getByRole("button", { name: "Record payment for Netflix" })
      .tap();
    await drawer(page).getByRole("button", { name: "Record payment" }).tap();
    await expect(drawer(page)).toHaveCount(0);
    await expect.poll(() => transactionCount(page)).toBe(1);
  });

  test("details lead to Record payment, then explicit amount editing", async ({
    page,
  }) => {
    await seedSchedules(page);
    await page.getByRole("button", { name: "Salary", exact: true }).tap();
    await drawer(page).getByRole("button", { name: "Record payment" }).tap();
    await expect(
      drawer(page).getByText("Nothing is recorded until you confirm."),
    ).toBeVisible();
    await drawer(page).getByRole("button", { name: "Change amount" }).tap();
    await expect(drawer(page).getByLabel("Deposit")).toHaveValue("2000.00");
    expect(await transactionCount(page)).toBe(0);
  });

  test("skip asks first, then moves the due date without recording", async ({
    page,
  }) => {
    await seedSchedules(page);
    const before = await nextDue(page, "Netflix");

    await page.getByRole("button", { name: "Skip Netflix" }).tap();
    await expect(drawer(page).getByText("Skip this payment?")).toBeVisible();
    await expect(drawer(page)).toContainText("Nothing is recorded");
    await drawer(page).getByRole("button", { name: "Cancel" }).tap();
    await expect(drawer(page)).toHaveCount(0);
    expect(await nextDue(page, "Netflix")).toBe(before);

    await page.getByRole("button", { name: "Skip Netflix" }).tap();
    await drawer(page).getByRole("button", { name: "Skip", exact: true }).tap();
    await expect(drawer(page)).toHaveCount(0);
    await expect.poll(() => nextDue(page, "Netflix")).not.toBe(before);
    expect(await transactionCount(page)).toBe(0);
  });

  test("details offer Skip too, and it confirms before acting", async ({
    page,
  }) => {
    await seedSchedules(page);
    const before = await nextDue(page, "Netflix");
    await page.getByRole("button", { name: "Netflix", exact: true }).tap();
    await drawer(page).getByRole("button", { name: "Skip", exact: true }).tap();
    await expect(drawer(page).getByText("Skip this payment?")).toBeVisible();
    expect(await nextDue(page, "Netflix")).toBe(before);
    await drawer(page).getByRole("button", { name: "Skip", exact: true }).tap();
    await expect.poll(() => nextDue(page, "Netflix")).not.toBe(before);
  });

  test("delete asks for confirmation first", async ({ page }) => {
    await seedSchedules(page);
    await page.getByRole("button", { name: "Delete Rent" }).tap();
    await expect(page.getByText("Delete subscription?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).tap();
    await expect(cards(page)).toHaveCount(4);
  });

  test("empty and filter-empty states differ", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => Boolean(window.api));
    await page.goto("/#/scheduled");
    await expect(page.getByText("No subscriptions yet.")).toBeVisible();
    await expect(page.getByText(/No subscriptions for/)).toHaveCount(0);
  });

  test("editor drawer is expanded and dirty dismissal asks first", async ({
    page,
  }) => {
    await seedSchedules(page);
    await page.getByRole("button", { name: "Edit Netflix" }).tap();
    await expect(
      drawer(page).getByText("Edit Scheduled Payment"),
    ).toBeVisible();
    await expect(drawer(page).getByText("Recurrence Rules")).toBeVisible();
    const size = await drawer(page).evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(size).toBeGreaterThan(700);

    await drawer(page).getByLabel("Notes").fill("Changed");
    await drawer(page).getByRole("button", { name: "Cancel" }).tap();
    await expect(page.getByText("Discard changes?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).last().tap();
    await expect(drawer(page).getByLabel("Notes")).toHaveValue("Changed");
  });

  test("no horizontal overflow at 320px, including overlays", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);
    await page.getByRole("button", { name: "Show calendar" }).tap();
    const overflow = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "Edit Netflix" }).tap();
    await expect(drawer(page)).toBeVisible();
    const drawerOverflow = await drawer(page).evaluate(
      (el) => el.scrollWidth - el.clientWidth,
    );
    expect(drawerOverflow).toBeLessThanOrEqual(1);
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("calendar panel stays and cards align in columns", async ({ page }) => {
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);
    await expect(page.getByLabel("Next due dates calendar")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^(Show|Hide) calendar$/ }),
    ).toHaveCount(0);

    const right = await page
      .locator('[data-slot="scheduled-amount"]')
      .evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().right)),
      );
    expect(Math.max(...right) - Math.min(...right)).toBeLessThanOrEqual(1);

    // The due column (first <p> in each card) shares one left edge.
    const left = await cards(page).evaluateAll((els) =>
      els.map((el) =>
        Math.round(
          el.querySelector("p:not([data-slot])")!.getBoundingClientRect().left,
        ),
      ),
    );
    expect(Math.max(...left) - Math.min(...left)).toBeLessThanOrEqual(1);

    // Single-row cards: amount and actions share the card's vertical centre.
    const offsets = await cards(page).evaluateAll((els) =>
      els.map((card) => {
        const amount = card
          .querySelector('[data-slot="scheduled-amount"]')!
          .getBoundingClientRect();
        const action = [...card.querySelectorAll("button")]
          .reverse()
          .find((b) => b.getBoundingClientRect().width > 0)!
          .getBoundingClientRect();
        return Math.abs(
          amount.top + amount.height / 2 - (action.top + action.height / 2),
        );
      }),
    );
    expect(Math.max(...offsets)).toBeLessThanOrEqual(1);

    await expect(
      page.getByRole("button", { name: "Record payment for Netflix" }),
    ).toBeVisible();
  });

  test("desktop drops auto-post text, keeps Paused, and skip confirms", async ({
    page,
  }) => {
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);
    const gym = cards(page).filter({ hasText: "Gym" });
    await expect(gym.getByText("Paused", { exact: true })).toBeVisible();
    await expect(gym.getByText(/Auto-post/)).toBeHidden();
    await expect(
      page.locator('[data-slot="scheduled-status"]').first(),
    ).toBeHidden();

    // One compact row: no second line for status.
    const heights = await cards(page).evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().height),
    );
    expect(Math.max(...heights)).toBeLessThanOrEqual(70);

    const before = await nextDue(page, "Netflix");
    await page.getByRole("button", { name: "Skip Netflix" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Skip this payment?")).toBeVisible();
    expect(await nextDue(page, "Netflix")).toBe(before);
    await dialog.getByRole("button", { name: "Skip", exact: true }).click();
    await expect.poll(() => nextDue(page, "Netflix")).not.toBe(before);
    expect(await transactionCount(page)).toBe(0);
  });

  test("sort, details dialog and record dialog", async ({ page }) => {
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);

    await page.getByRole("button", { name: /^Sort: Next due/ }).click();
    await page.getByRole("menuitemradio", { name: "Payee, A to Z" }).click();
    expect(await cardPayees(page)).toEqual([
      "Gym",
      "Netflix",
      "Rent",
      "Salary",
    ]);

    await page.getByRole("button", { name: "Netflix", exact: true }).click();
    const details = page.getByRole("dialog");
    await expect(details.getByText("Scheduled Payment Details")).toBeVisible();
    await details
      .locator('[data-slot="dialog-footer"]')
      .getByRole("button", { name: "Close" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await transactionCount(page)).toBe(0);

    await page
      .getByRole("button", { name: "Record payment for Netflix" })
      .click();
    const record = page.getByRole("dialog");
    await expect(record.getByLabel("Withdrawal")).toHaveValue("12.99");
    expect(await transactionCount(page)).toBe(0);
    await record.getByRole("button", { name: "Record", exact: true }).click();
    await expect.poll(() => transactionCount(page)).toBe(1);
  });
});

test.describe("crossover (1024px)", () => {
  test.use({ viewport: { width: 1024, height: 800 } });

  test("payee keeps a readable width; frequency and account sit beneath it", async ({
    page,
  }) => {
    await seedSchedules(page);
    await expect(cards(page)).toHaveCount(4);

    const widths = await cards(page).evaluateAll((els) =>
      els.map(
        // The payee cell (button + badge), not the shrink-wrapped button.
        (el) =>
          el.querySelector("button")!.parentElement!.getBoundingClientRect()
            .width,
      ),
    );
    // "Netflix" never wraps into a sliver; the column has room to spare.
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(180);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);

    // Account and frequency sit on a second line directly under the payee.
    const netflix = cards(page).filter({ hasText: "Netflix" });
    const payeeBox = (await netflix
      .getByRole("button", { name: "Netflix", exact: true })
      .boundingBox())!;
    const repeatsBox = (await netflix
      .locator("p")
      .filter({ hasText: "Repeats" })
      .boundingBox())!;
    const accountBox = (await netflix
      .locator("p")
      .filter({ hasText: "Account" })
      .boundingBox())!;
    expect(repeatsBox.y).toBeGreaterThan(payeeBox.y + payeeBox.height - 1);
    expect(Math.abs(repeatsBox.x - payeeBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(accountBox.y - repeatsBox.y)).toBeLessThanOrEqual(1);

    // Amount and actions stay centred against the two-line card.
    const offsets = await cards(page).evaluateAll((els) =>
      els.map((card) => {
        const box = card.getBoundingClientRect();
        const amount = card
          .querySelector('[data-slot="scheduled-amount"]')!
          .getBoundingClientRect();
        return Math.abs(
          amount.top + amount.height / 2 - (box.top + box.height / 2),
        );
      }),
    );
    expect(Math.max(...offsets)).toBeLessThanOrEqual(1);
  });
});
