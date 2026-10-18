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

// Top-level drawer only: the nested discard confirmation is also a drawer.
const drawer = (page: Page) =>
  page.locator('[data-slot="drawer-popup"]:not([data-nested])');

test("phone: details drawer, explicit edit, dirty guard and save", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const accountId = await seedTransaction(page);
  await page.goto(`/#/accounts/${accountId}`);

  await page.getByRole("button", { name: "Supermarket", exact: true }).click();
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

  // A software keyboard (simulated via the inset Base UI publishes) lifts the
  // footer so Save stays tappable above it.
  const viewport = page.locator('[data-slot="drawer-viewport"]');
  await viewport.evaluate((el) =>
    el.style.setProperty("--drawer-keyboard-inset", "300px"),
  );
  await expect
    .poll(async () => {
      const box = await save.boundingBox();
      return box ? box.y + box.height : 999;
    })
    .toBeLessThanOrEqual(844 - 300);
  await viewport.evaluate((el) =>
    el.style.removeProperty("--drawer-keyboard-inset"),
  );

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
  await page.getByRole("button", { name: "Supermarket", exact: true }).click();
  await expect(drawer(page).getByText("Edited on a phone")).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
});

test("desktop: card tap opens a details dialog; edit uses the pencil", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const accountId = await seedTransaction(page);
  await page.goto(`/#/accounts/${accountId}`);

  await page.getByRole("button", { name: "Supermarket", exact: true }).click();
  const detailsDialog = page.getByRole("dialog");
  await expect(detailsDialog).toBeVisible();
  await expect(detailsDialog.getByText("Transaction Details")).toBeVisible();
  await detailsDialog
    .locator('[data-slot="dialog-footer"]')
    .getByRole("button", { name: "Close" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Edit Supermarket" }).click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Edit Transaction")).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);
});

test("tablet: dialog stays inside the visual viewport while the keyboard opens and pans", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => {
    const viewport = Object.assign(new EventTarget(), {
      width: 1024,
      height: 768,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", {
      value: viewport,
      configurable: true,
    });
  });
  const accountId = await seedTransaction(page);
  await page.goto(`/#/accounts/${accountId}`);
  await page.getByRole("button", { name: "Edit Supermarket" }).click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  const notes = dialog.getByLabel("Notes");
  await notes.fill("Draft survives keyboard changes");
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 320, offsetTop: 40 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
    window.visualViewport!.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return box.y;
    })
    .toBeGreaterThanOrEqual(40);
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(360);
  const save = dialog.getByRole("button", { name: "Save Changes" });
  const saveBox = (await save.boundingBox())!;
  expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(360);
  await expect(notes).toBeFocused();
  await expect(
    dialog.getByText("Edit Transaction", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.assign(window.visualViewport!, { height: 768, offsetTop: 0 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(notes).toHaveValue("Draft survives keyboard changes");
  await save.click();
  await expect(dialog).toBeHidden();
});

test.describe("phone touch", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("tapping Save while the keyboard is up saves on the first tap", async ({
    page,
  }) => {
    const accountId = await seedTransaction(page);
    await page.goto(`/#/accounts/${accountId}`);

    await page.getByRole("button", { name: "Supermarket", exact: true }).tap();
    await drawer(page).getByRole("button", { name: "Edit" }).tap();
    const notes = drawer(page).getByLabel("Notes");
    await notes.fill("Saved in one tap");

    // Simulate an open software keyboard: the inset lifts the footer, and
    // blurring the field dismisses the keyboard (inset back to 0), as on iOS.
    await page.evaluate(() => {
      // Set on the popup so the provider's own (0px in automation) value on
      // the viewport cannot overwrite it.
      const popup = document.querySelector<HTMLElement>(
        '[data-slot="drawer-popup"]',
      )!;
      popup.style.setProperty("--drawer-keyboard-inset", "300px");
      document.activeElement?.addEventListener(
        "focusout",
        () => popup.style.setProperty("--drawer-keyboard-inset", "0px"),
        { once: true },
      );
    });
    await expect(notes).toBeFocused();

    const save = drawer(page).getByRole("button", { name: "Save Changes" });
    await expect
      .poll(async () => {
        const box = await save.boundingBox();
        return box ? box.y + box.height : 999;
      })
      .toBeLessThanOrEqual(844 - 300);
    const box = (await save.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

    await expect(drawer(page)).toBeHidden();
    await page.getByRole("button", { name: "Supermarket", exact: true }).tap();
    await expect(drawer(page).getByText("Saved in one tap")).toBeVisible();
  });
});
