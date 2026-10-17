import { expect, test, type Page } from "@playwright/test";

async function seedTransaction(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.api));
  return page.evaluate(async () => {
    const [account = null] = await window.api.createAccount({
      name: `Overlay pilot ${Date.now()}`,
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
    await window.api.createTransaction({
      accountId: account.id,
      date: new Date().toISOString().slice(0, 10),
      payee: "Supermarket",
      amount: -42.8,
      categoryId: null,
      notes: "Weekly shop and household essentials.",
      cleared: false,
    });
    return account.id;
  });
}

const drawer = (page: Page) => page.locator('[data-slot="drawer-popup"]');

test("phone: details drawer, explicit edit, dirty guard and save", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const accountId = await seedTransaction(page);
  await page.goto(`/#/accounts/${accountId}`);

  await page.getByRole("cell", { name: "Supermarket" }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByText("Transaction Details")).toBeVisible();
  await expect(drawer(page).getByRole("textbox")).toHaveCount(0);
  await expect(drawer(page).getByText("Uncleared")).toBeVisible();

  // Content-sized, anchored to the bottom edge, below the status area.
  await expect
    .poll(async () => {
      const box = await drawer(page).boundingBox();
      return box ? Math.round(box.y + box.height) : 0;
    })
    .toBe(844);
  const detailsBox = await drawer(page).boundingBox();
  expect(detailsBox!.height).toBeLessThan(844 * 0.7);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "INPUT",
  );

  await drawer(page).getByRole("button", { name: "Edit" }).click();
  await expect(drawer(page).getByText("Edit Transaction")).toBeVisible();
  expect(
    await page.evaluate(() => document.activeElement?.tagName),
  ).not.toMatch(/INPUT|TEXTAREA/);

  // Expanded editor: near full height with fixed header/footer.
  await expect
    .poll(async () => (await drawer(page).boundingBox())?.height ?? 0)
    .toBeGreaterThan(844 * 0.9);
  const save = drawer(page).getByRole("button", { name: "Save Changes" });
  const saveBox = await save.boundingBox();
  expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(844);
  expect(saveBox!.height).toBeGreaterThanOrEqual(44);

  // Date picker portal stacks above the drawer and is interactive.
  await drawer(page)
    .getByRole("button", { name: /\d{2}\/\d{2}\/\d{4}/ })
    .click();
  const calendar = page.locator('[data-slot="popover-content"]');
  await expect(calendar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendar).toBeHidden();
  await expect(drawer(page)).toBeVisible();

  // Combobox popup inside the drawer: Escape closes only the list.
  await drawer(page).getByPlaceholder("No category").click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(drawer(page)).toBeVisible();
  await expect(page.getByText("Discard changes?")).toBeHidden();

  const notes = drawer(page).getByLabel("Notes");
  await notes.fill("Edited on a phone");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await page
    .getByRole("dialog", { name: "Discard changes?" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(page.getByText("Discard changes?")).toBeHidden();
  await expect(notes).toHaveValue("Edited on a phone");

  // A dirty swipe-down asks instead of dismissing; the drawer stays open.
  const handle = page.locator('[data-slot="drawer-swipe-handle"]');
  const hb = await handle.boundingBox();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  for (let dy = 40; dy <= 600; dy += 40) {
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + dy);
  }
  await page.mouse.up();
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await page
    .getByRole("dialog", { name: "Discard changes?" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(drawer(page)).toBeVisible();
  await expect
    .poll(async () => (await drawer(page).boundingBox())?.y ?? 999)
    .toBeLessThan(844 * 0.1);
  await expect(notes).toHaveValue("Edited on a phone");

  await save.click();
  await expect(drawer(page)).toBeHidden();
  await page.getByRole("cell", { name: "Supermarket" }).click();
  await expect(drawer(page).getByText("Edited on a phone")).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
});

test("desktop: row click keeps table behavior and edit uses a dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const accountId = await seedTransaction(page);
  await page.goto(`/#/accounts/${accountId}`);

  await page.getByRole("cell", { name: "Supermarket" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .getByRole("row", { name: /Supermarket/ })
    .getByRole("button", { name: "Edit transaction" })
    .click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Edit Transaction")).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);
});
