// SY-042 and SY-043: download a backup, the import warning while synced, the
// toasts for sync problems, and the "review reconciliation" notice. Runs in
// the sync-origin project with the sync server mocked (e2e/helpers/sync-mock.ts).
import { Buffer } from "node:buffer";
import { expect, test, type Page } from "@playwright/test";
import { mockSyncServer, type SyncMock } from "./helpers/sync-mock";

const section = (page: Page) =>
  page.getByRole("region", { name: "Sync", exact: true });
const toasts = (page: Page) => page.locator("[data-sonner-toast]");

/** Turn sync on and Start it (empty server), ending on the Settings page. */
async function startSync(page: Page): Promise<SyncMock> {
  const mock = await mockSyncServer(page, { hasData: false });
  await page.goto("/#/settings");
  await expect(section(page)).toBeVisible();
  await section(page).getByRole("button", { name: "Turn on sync" }).click();
  await page.getByLabel(/I understand, and I agree/).check();
  await section(page).getByRole("button", { name: "Continue" }).click();
  await section(page).getByLabel("Code").fill("ABCD-EFGH");
  await section(page).getByLabel("Device name").fill("Test browser");
  await section(page).getByRole("button", { name: "Connect" }).click();
  await section(page).getByRole("button", { name: "Start sync" }).click();
  await expect(page.getByTestId("sync-state")).toContainText("Up to date");
  return mock;
}

async function syncNow(page: Page) {
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeEnabled();
}

async function addLocalPayee(page: Page, name: string) {
  await page.evaluate(
    (payee) =>
      window.api.createPayee({ name: payee, categoryId: null, amount: null }),
    name,
  );
}

/** Data transfer lives on the Advanced tab of Settings. */
async function chooseImportFile(page: Page, document: string) {
  await page.getByRole("tab", { name: "Advanced" }).click();
  await page.getByLabel("Choose Budgie data package").setInputFiles({
    name: "budgie-data.json",
    mimeType: "application/json",
    buffer: Buffer.from(document),
  });
}

test.describe("download a backup (SY-042)", () => {
  test("the Sync section offers Download backup, which saves the portable export", async ({
    page,
  }) => {
    await startSync(page);
    const download = page.waitForEvent("download");
    await section(page)
      .getByRole("button", { name: "Download backup" })
      .click();
    expect((await download).suggestedFilename()).toMatch(
      /^budgie-export-\d{4}-\d\d-\d\d\.json$/,
    );
  });

  test("a portable import while synced warns it will overwrite all devices, after syncing", async ({
    page,
  }) => {
    const mock = await startSync(page);
    const exported = await page.evaluate(() => window.api.exportPortableData());
    const syncsBefore = mock.requests.filter(
      (r) => r === "POST /v1/sync",
    ).length;

    await chooseImportFile(page, exported);
    const dialog = page
      .getByRole("dialog")
      .or(page.locator('[data-slot="drawer-popup"]'));
    await expect(dialog).toContainText("Replace data on all devices?");
    await expect(dialog).toContainText("overwrite the cloud copy");
    await expect(dialog).toContainText("every device you have connected");
    await expect(
      dialog.getByRole("button", { name: "Download backup" }),
    ).toBeVisible();
    await expect(dialog).toContainText("up to date with the cloud");
    expect(mock.requests.filter((r) => r === "POST /v1/sync").length).toBe(
      syncsBefore + 1,
    );

    // Nothing happens until confirmed.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("the import warning is stronger when the pre-import sync fails", async ({
    page,
  }) => {
    const mock = await startSync(page);
    const exported = await page.evaluate(() => window.api.exportPortableData());
    mock.offline = true;
    await chooseImportFile(page, exported);
    const dialog = page
      .getByRole("dialog")
      .or(page.locator('[data-slot="drawer-popup"]'));
    await expect(dialog.getByRole("alert")).toContainText(
      "could not sync first",
    );
    await expect(
      dialog.getByRole("button", { name: "Import anyway" }),
    ).toBeVisible();
  });
});

test.describe("sync problem toasts (SY-043)", () => {
  test("clock too far ahead: one toast on the transition, none on later cycles or after a reload", async ({
    page,
  }) => {
    const mock = await startSync(page);
    await expect(toasts(page)).toHaveCount(0);
    await addLocalPayee(page, "Clock payee");
    mock.rejectPush = "drift";
    await syncNow(page);
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page).first()).toContainText("clock is too far ahead");
    await expect(page.getByTestId("sync-state")).toContainText(
      "clock is ahead",
    );

    // A further cycle in the same state raises nothing new.
    await toasts(page).first().hover();
    await page.getByRole("button", { name: "Close toast" }).click();
    await expect(toasts(page)).toHaveCount(0);
    await syncNow(page);
    await expect(page.getByTestId("sync-state")).toContainText(
      "clock is ahead",
    );
    await page.waitForTimeout(500);
    await expect(toasts(page)).toHaveCount(0);

    // Not news after a reload either.
    await page.reload();
    await expect(page.getByTestId("sync-state")).toContainText(
      "clock is ahead",
    );
    await page.waitForTimeout(500);
    await expect(toasts(page)).toHaveCount(0);
  });

  test("app too old: a toast that comes back after a reload while it holds", async ({
    page,
  }) => {
    const mock = await startSync(page);
    mock.failSync = {
      status: 409,
      error: "format_too_old",
      extra: { formatVersion: 99 },
    };
    await syncNow(page);
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page).first()).toContainText("too old to sync");
    await page.reload();
    await expect(toasts(page).first()).toContainText("too old to sync");
    await expect(toasts(page)).toHaveCount(1);
  });

  test("this device was disconnected: a toast with a way to Settings", async ({
    page,
  }) => {
    const mock = await startSync(page);
    mock.failSync = { status: 401, error: "revoked" };
    await syncNow(page);
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page).first()).toContainText(
      "This device was disconnected from sync",
    );
    await expect(
      toasts(page).first().getByRole("button", { name: "Open Settings" }),
    ).toBeVisible();
  });

  test("daily limit: says when Budgie will try again, once, and not after a reload", async ({
    page,
  }) => {
    const mock = await startSync(page);
    mock.failSync = { status: 503, error: "daily_limit", retryAfter: 3600 };
    await syncNow(page);
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page).first()).toContainText("daily limit");
    await expect(toasts(page).first()).toContainText(/try again at \d\d:\d\d/);

    await page.reload();
    await expect(page.getByTestId("sync-state")).toContainText("Daily limit");
    await page.waitForTimeout(500);
    await expect(toasts(page)).toHaveCount(0);
  });
});

test.describe("review reconciliation (SY-043)", () => {
  /** An account whose reconciled total (50) differs from its checkpoint (100). */
  async function seedMismatch(page: Page) {
    return page.evaluate(async () => {
      const [account] = await window.api.createAccount({
        name: "Review me",
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
      if (!account) throw new Error("no account");
      const [transaction] = await window.api.createTransaction({
        accountId: account.id,
        categoryId: null,
        date: "2026-03-01",
        payee: "Reconciled",
        amount: 50,
        notes: null,
        cleared: true,
      });
      if (!transaction) throw new Error("no transaction");
      await window.api.reconcileTransactions({
        toReconcile: [transaction.id],
        toUnclear: [],
        checkpoint: {
          accountId: account.id,
          date: "2026-03-02",
          balance: 100,
          notes: null,
        },
      });
      return { accountId: account.id };
    });
  }

  test("a mismatching account shows a notice linking to it, until the totals agree", async ({
    page,
  }) => {
    await startSync(page);
    const { accountId } = await seedMismatch(page);
    await page.reload();
    await syncNow(page);

    const notice = page.getByTestId("reconciliation-review-notice");
    await expect(notice).toContainText("Review reconciliation");
    // Visible without opening Settings: go to the accounts list.
    await page.evaluate(() => {
      window.location.hash = "#/";
    });
    await expect(notice).toBeVisible();
    await notice.getByRole("link", { name: "Review me" }).click();
    await expect(page).toHaveURL(new RegExp(`#/accounts/${accountId}$`));
    await expect(notice).toBeVisible();

    // Nothing is stored: once the totals agree the notice goes.
    await page.evaluate(
      (id) =>
        window.api.createAccountReconciliation({
          accountId: id,
          date: "2026-03-03",
          balance: 50,
          notes: null,
        }),
      accountId,
    );
    await page.reload();
    await expect(
      page.getByRole("link", { name: /^Sync status:/ }),
    ).toBeVisible();
    await expect(notice).toHaveCount(0);
  });

  test.describe("on a phone", () => {
    test.use({ hasTouch: true, viewport: { width: 320, height: 568 } });

    test("320px: the notice and a toast fit the screen", async ({ page }) => {
      const mock = await startSync(page);
      await seedMismatch(page);
      await page.reload();
      // The service worker may still reload the page once as it takes over.
      await page.waitForFunction(() => navigator.serviceWorker.controller);
      await expect(page.getByTestId("sync-state")).toBeVisible();
      mock.failSync = { status: 503, error: "daily_limit", retryAfter: 3600 };
      await syncNow(page);
      await page.evaluate(() => {
        window.location.hash = "#/";
      });
      const notice = page.getByTestId("reconciliation-review-notice");
      await expect(notice).toBeVisible();
      await expect(toasts(page).first()).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      const box = (await notice.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      const toastBox = (await toasts(page).first().boundingBox())!;
      expect(toastBox.x).toBeGreaterThanOrEqual(0);
      expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(320);
      const link = (await notice.getByRole("link").boundingBox())!;
      expect(link.height).toBeGreaterThanOrEqual(43.5);
    });
  });
});
