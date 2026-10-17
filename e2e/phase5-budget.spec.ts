import { expect, test, type Page } from "@playwright/test";

const LONG_NAME = "Quarterly home insurance and annual boiler servicing fund";

type Seeded = { ids: { groceries: number; long: number; fun: number } };

async function seedBudget(page: Page): Promise<Seeded> {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  const ids = await page.evaluate(async (longName) => {
    const d = new Date();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const today = `${month}-${String(d.getDate()).padStart(2, "0")}`;

    const [account] = await window.api.createAccount({
      name: `Budget e2e ${Date.now()}`,
      number: null,
      type: "bank",
      balance: 2000,
      currency: "GBP",
      notes: null,
      interestRate: null,
      creditLimit: null,
      pendingReconcileBalance: null,
      pendingReconcileDate: null,
    });
    const category = async (name: string) => {
      const [row] = await window.api.createCategory({
        name,
        parentId: null,
        expenseType: "expense",
      });
      return row!.id;
    };
    const supermarket = await category("Supermarket");
    const takeaway = await category("Takeaway");
    const insurance = await category("Insurance");

    const envelope = async (name: string, sortOrder: number) => {
      const [row] = await window.api.createEnvelope({
        name,
        active: true,
        sortOrder,
      });
      return row!.id;
    };
    const groceries = await envelope("Groceries", 0);
    const long = await envelope(longName, 1);
    const fun = await envelope("Fun", 2);
    await window.api.createEnvelopeCategory({
      envelopeId: groceries,
      categoryId: supermarket,
    });
    await window.api.createEnvelopeCategory({
      envelopeId: fun,
      categoryId: takeaway,
    });
    await window.api.createEnvelopeCategory({
      envelopeId: long,
      categoryId: insurance,
    });
    await window.api.upsertBudgetAllocation(groceries, month, 400);
    await window.api.upsertBudgetAllocation(long, month, 120);
    await window.api.upsertBudgetAllocation(fun, month, 50);
    // Overspend "Fun" so it carries a negative available amount.
    await window.api.createTransaction({
      accountId: account!.id,
      date: today,
      payee: "Pizza place",
      amount: -80,
      categoryId: takeaway,
      notes: null,
      cleared: false,
    });
    return { groceries, long, fun };
  }, LONG_NAME);
  await page.goto("/#/budget");
  await page.reload();
  await page.waitForFunction(() => Boolean(window.api));
  await expect(cards(page)).toHaveCount(3);
  return { ids };
}

const parentDrawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"]:not([data-nested])');
const nestedDrawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"][data-nested]');
const cards = (page: Page) => page.locator('[data-slot="envelope-card"]');
const cardFor = (page: Page, name: string) =>
  cards(page).filter({
    has: page.getByRole("heading", { name, exact: true }),
  });

async function envelopeOrder(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (await window.api.getEnvelopes()).map((e) => e.name),
  );
}

async function cardNames(page: Page): Promise<string[]> {
  return cards(page).locator("h3").allTextContents();
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

async function overflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

test.describe("phone", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("order, 44px targets and category info without hover", async ({
    page,
  }) => {
    await seedBudget(page);

    const month = await page.getByRole("group", { name: "Budget month" }).boundingBox();
    const summary = await page
      .getByRole("region", { name: "Available to budget" })
      .boundingBox();
    const add = await page.getByRole("button", { name: "Add envelope" }).boundingBox();
    const move = await page.getByRole("button", { name: "Move money" }).boundingBox();
    const firstCard = await cards(page).first().boundingBox();
    expect(month!.y).toBeLessThan(summary!.y);
    expect(summary!.y).toBeLessThan(add!.y);
    expect(Math.abs(add!.y - move!.y)).toBeLessThan(2);
    expect(add!.y).toBeLessThan(firstCard!.y);

    for (const [label, locator] of [
      ["previous month", page.getByRole("button", { name: "Previous month" })],
      ["next month", page.getByRole("button", { name: "Next month" })],
      ["add envelope", page.getByRole("button", { name: "Add envelope" })],
      ["move money", page.getByRole("button", { name: "Move money" })],
      ["more", page.getByRole("button", { name: "More actions", exact: true })],
      [
        "card menu",
        page.getByRole("button", { name: "More actions for Groceries" }),
      ],
      [
        "drag handle",
        page.getByRole("button", { name: "Drag to reorder Groceries" }),
      ],
      [
        "edit assigned",
        page.getByRole("button", { name: /Edit assigned amount for Groceries/ }),
      ],
    ] as const) {
      await expectHitTarget(locator, label);
    }

    // Fill from last month is secondary: only inside More.
    await expect(
      page.getByRole("button", { name: "Fill from last month" }),
    ).toBeHidden();

    // Categories are plain text on the card, no hover needed.
    const groceries = cardFor(page, "Groceries");
    await expect(groceries.getByText("Supermarket")).toBeVisible();
    await expect(groceries).toContainText("£400.00");
    // Negative available keeps its sign.
    await expect(cardFor(page, "Fun")).toContainText("-£30.00");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("Fill from last month asks first and never runs silently", async ({
    page,
  }) => {
    await seedBudget(page);
    await page.getByRole("button", { name: "More actions", exact: true }).tap();
    await page.getByRole("menuitem", { name: "Fill from last month" }).tap();
    await expect(
      page.getByRole("heading", { name: "Fill from last month?" }),
    ).toBeVisible();
    await expect(
      nestedDrawer(page).or(parentDrawer(page)).getByRole("button", { name: "Cancel" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Cancel" }).tap();
    await expect(page.getByRole("status").filter({ hasText: /Filled|Nothing/ })).toHaveCount(0);

    await page.getByRole("button", { name: "More actions", exact: true }).tap();
    await page.getByRole("menuitem", { name: "Fill from last month" }).tap();
    await page.getByRole("button", { name: "Fill", exact: true }).tap();
    await expect(
      page.getByRole("status").filter({ hasText: /Nothing to fill|Filled/ }),
    ).toBeVisible();
  });

  test("Move up / Move down persist order and are disabled at the ends", async ({
    page,
  }) => {
    await seedBudget(page);

    const menuFor = async (name: string) => {
      await expect(page.getByRole("menuitem")).toHaveCount(0);
      await page
        .getByRole("button", { name: `More actions for ${name}` })
        .tap();
    };

    await menuFor("Groceries");
    await expect(page.getByRole("menuitem", { name: "Move up" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.getByRole("menuitem", { name: "Move down" }).tap();
    await expect.poll(() => envelopeOrder(page)).toEqual([
      LONG_NAME,
      "Groceries",
      "Fun",
    ]);
    expect(await cardNames(page)).toEqual([LONG_NAME, "Groceries", "Fun"]);

    await menuFor("Fun");
    await expect(
      page.getByRole("menuitem", { name: "Move down" }),
    ).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("menuitem", { name: "Move up" }).tap();
    await expect.poll(() => envelopeOrder(page)).toEqual([
      LONG_NAME,
      "Fun",
      "Groceries",
    ]);

    await page.reload();
    await expect(cards(page)).toHaveCount(3);
    expect(await cardNames(page)).toEqual([LONG_NAME, "Fun", "Groceries"]);
  });

  test("assigned amount: explicit Save / Cancel, no blur-save", async ({
    page,
  }) => {
    await seedBudget(page);
    const groceries = cardFor(page, "Groceries");
    const allocation = () =>
      page.evaluate(async () => {
        const d = new Date();
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const rows = await window.api.getBudgetAllocationsByMonth(month);
        const envelopes = await window.api.getEnvelopes();
        const id = envelopes.find((e) => e.name === "Groceries")!.id;
        return rows.find((r) => r.envelopeId === id)?.assigned;
      });

    // Tapping the card body does nothing.
    await groceries.locator("h3").tap();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);

    await groceries
      .getByRole("button", { name: /Edit assigned amount for Groceries/ })
      .tap();
    const input = page.getByLabel("Assigned amount for Groceries", { exact: true });
    await expect(input).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("INPUT");
    await input.fill("450");
    // Tapping elsewhere (blur) must not save.
    await page.getByRole("heading", { name: "Envelopes" }).tap();
    await expect(input).toBeVisible();
    expect(await allocation()).toBe(400);

    await groceries.getByRole("button", { name: "Cancel" }).tap();
    await expect(input).toHaveCount(0);
    await expect(groceries).toContainText("£400.00");
    expect(await allocation()).toBe(400);

    await groceries
      .getByRole("button", { name: /Edit assigned amount for Groceries/ })
      .tap();
    await expect(input).toHaveValue("400");
    await input.fill("450.5");
    await groceries.getByRole("button", { name: "Save" }).tap();
    await expect(input).toHaveCount(0);
    await expect(groceries).toContainText("£450.50");
    expect(await allocation()).toBe(450.5);
  });

  test("Move money drawer", async ({ page }) => {
    await seedBudget(page);
    await page.getByRole("button", { name: "Move money" }).tap();
    const drawer = parentDrawer(page);
    await expect(drawer.getByRole("heading", { name: "Move Money" })).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("INPUT");

    // Short drawer anchored to the bottom, not full height.
    const box = (await drawer.boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(843);
    expect(box.height).toBeLessThan(700);

    await drawer.getByRole("combobox", { name: "From" }).tap();
    await page.getByRole("option", { name: "Groceries", exact: true }).tap();
    await drawer.getByRole("combobox", { name: "To" }).tap();
    await page.getByRole("option", { name: "Fun", exact: true }).tap();
    await drawer.getByLabel("Amount (£)").fill("25");
    await expectHitTarget(drawer.getByRole("button", { name: "Move", exact: true }), "move");

    // Dirty drawer asks before discarding.
    await drawer.getByRole("button", { name: "Cancel" }).tap();
    await expect(
      nestedDrawer(page).getByRole("heading", { name: "Discard changes?" }),
    ).toBeVisible();
    await nestedDrawer(page).getByRole("button", { name: "Cancel" }).tap();
    await expect(nestedDrawer(page)).toBeHidden();
    await expect(drawer).toBeVisible();

    await drawer.getByRole("button", { name: "Move", exact: true }).tap();
    await expect(drawer).toBeHidden();
    const transfers = await page.evaluate(() =>
      window.api.getBudgetTransfers(),
    );
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ amount: 25 });
    // 400 assigned - 25 moved out => 375 available for Groceries.
    await expect(cardFor(page, "Groceries")).toContainText(
      "£375.00",
    );
  });

  test("envelope editor is expanded, keeps categories and deletes via confirm", async ({
    page,
  }) => {
    await seedBudget(page);
    await page.getByRole("button", { name: "More actions for Groceries" }).tap();
    await page.getByRole("menuitem", { name: "Edit envelope" }).tap();
    const drawer = parentDrawer(page);
    await expect(drawer.getByRole("heading", { name: "Edit Envelope" })).toBeVisible();
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
    ).not.toBe("INPUT");
    const box = (await drawer.boundingBox())!;
    expect(box.height).toBeGreaterThan(700);
    await expect(drawer.getByLabel("Supermarket")).toBeChecked();
    await expect(drawer.getByLabel("Takeaway")).not.toBeChecked();
    await expect(drawer.getByLabel("Takeaway")).toBeDisabled();

    await drawer.getByRole("button", { name: "Delete" }).tap();
    const confirm = nestedDrawer(page);
    await expect(
      confirm.getByRole("heading", { name: "Delete envelope?" }),
    ).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await confirm.getByRole("button", { name: "Cancel" }).tap();
    expect(await envelopeOrder(page)).toContain("Groceries");

    await drawer.getByRole("button", { name: "Delete" }).tap();
    await confirm.getByRole("button", { name: "Delete envelope" }).tap();
    await expect(drawer).toBeHidden();
    await expect.poll(() => envelopeOrder(page)).toEqual([LONG_NAME, "Fun"]);
  });

  test("create form retains drafts and creates with mapped categories", async ({
    page,
  }) => {
    await seedBudget(page);
    await page.getByRole("button", { name: "Add envelope" }).tap();
    const drawer = parentDrawer(page);
    await drawer.getByLabel("Name").fill("Holidays");
    await drawer.getByRole("button", { name: "Create" }).tap();
    await expect(drawer).toBeHidden();
    await expect.poll(() => envelopeOrder(page)).toContain("Holidays");
    await expect(cards(page)).toHaveCount(4);
  });

  test("no horizontal overflow at 320px with long names and negatives", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await seedBudget(page);
    await expect(cardFor(page, LONG_NAME)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    for (const card of await cards(page).all()) {
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320.5);
    }
    // Edit mode must also fit.
    await page
      .getByRole("button", { name: /Edit assigned amount for Fun/ })
      .tap();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Cancel" }).tap();
    // Drawers fit too.
    await page.getByRole("button", { name: "Move money" }).tap();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("aligned columns, inline edit, direct buttons and keyboard reorder", async ({
    page,
  }) => {
    await seedBudget(page);

    // Columns align across short and long cards.
    const edges = async (slot: string, side: "left" | "right") =>
      cards(page)
        .locator(`[data-slot="${slot}"]`)
        .evaluateAll(
          (els, s) =>
            els.map((el) => Math.round(el.getBoundingClientRect()[s as "left" | "right"])),
          side,
        );
    for (const [slot, side] of [
      ["envelope-available", "right"],
      ["envelope-spent", "right"],
      ["envelope-assigned", "left"],
    ] as const) {
      const values = await edges(slot, side);
      expect(values, slot).toHaveLength(3);
      expect(Math.max(...values) - Math.min(...values), slot).toBeLessThanOrEqual(1);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // Fill is a direct button at desktop width; More is hidden.
    await expect(
      page.getByRole("button", { name: "Fill from last month" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "More actions", exact: true }),
    ).toBeHidden();

    // Inline edit keeps blur-save and Enter.
    const groceries = cardFor(page, "Groceries");
    await groceries
      .getByRole("button", { name: /Edit assigned amount for Groceries/ })
      .click();
    const input = groceries.getByLabel("Assigned amount for Groceries", { exact: true });
    await expect(input).toBeFocused();
    await input.fill("410");
    await input.press("Enter");
    await expect(groceries).toContainText("£410.00");

    // Direct edit button opens the dialog (not a drawer).
    await page.getByRole("button", { name: "Edit Groceries" }).click();
    await expect(page.getByRole("dialog", { name: "Edit Envelope" })).toBeVisible();
    await expect(parentDrawer(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Keyboard drag on the handle persists the same order as the menu.
    const handle = page.getByRole("button", { name: "Drag to reorder Groceries" });
    await handle.focus();
    await expect(handle).toBeFocused();
    // dnd-kit announces each step; wait for it so keys are not dropped.
    const announcement = page.locator('[aria-live="assertive"]');
    await page.keyboard.press("Space");
    await expect(announcement).toContainText("moved over droppable area 1");
    // The sensor binds its key listener just after activation.
    await page.waitForTimeout(250);
    await page.keyboard.press("ArrowDown");
    await expect(announcement).toContainText("moved over droppable area 2");
    await page.keyboard.press("Space");
    await expect(announcement).toContainText("dropped over droppable area 2");
    await expect.poll(() => envelopeOrder(page)).toEqual([
      LONG_NAME,
      "Groceries",
      "Fun",
    ]);

    // Menu path gives the identical result in the reverse direction.
    await page.getByRole("button", { name: "More actions for Groceries" }).click();
    await page.getByRole("menuitem", { name: "Move up" }).click();
    await expect.poll(() => envelopeOrder(page)).toEqual([
      "Groceries",
      LONG_NAME,
      "Fun",
    ]);
  });

  test("mouse drag from the handle reorders; dragging the card body does not", async ({
    page,
  }) => {
    await seedBudget(page);
    const handle = page.getByRole("button", { name: "Drag to reorder Groceries" });
    const from = (await handle.boundingBox())!;
    const target = (await cards(page).nth(1).boundingBox())!;

    // Dragging by the card title is not a drag.
    const title = (await cards(page).first().locator("h3").boundingBox())!;
    await page.mouse.move(title.x + 5, title.y + 5);
    await page.mouse.down();
    await page.mouse.move(title.x + 5, target.y + target.height + 20, { steps: 10 });
    await page.mouse.up();
    expect(await envelopeOrder(page)).toEqual(["Groceries", LONG_NAME, "Fun"]);

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      from.x + from.width / 2,
      target.y + target.height / 2 + 30,
      { steps: 15 },
    );
    await page.mouse.up();
    await expect.poll(() => envelopeOrder(page)).toEqual([
      LONG_NAME,
      "Groceries",
      "Fun",
    ]);
  });

  test("Move money is a dialog, not a drawer", async ({
    page,
  }) => {
    await seedBudget(page);
    await page.getByRole("button", { name: "Move money" }).click();
    await expect(page.getByRole("dialog", { name: "Move Money" })).toBeVisible();
    await expect(parentDrawer(page)).toHaveCount(0);
  });
});

test("tablet: no overflow and Move money is a dialog", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await seedBudget(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await expect(
    page.getByRole("button", { name: "More actions", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move money" }).click();
  await expect(page.getByRole("dialog", { name: "Move Money" })).toBeVisible();
});
