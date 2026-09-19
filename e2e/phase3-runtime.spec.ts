import { expect, test } from "@playwright/test";

const waitForRuntime = async (page: import("@playwright/test").Page) => {
  await page.waitForFunction(() => Boolean(window.api));
};

const waitForServiceWorker = async (page: import("@playwright/test").Page) => {
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.active),
      ),
    )
    .toBe(true);
};

test("starts the isolated browser runtime and registers the service worker", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response?.headers()["cross-origin-embedder-policy"]).toBe(
    "require-corp",
  );
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(response?.headers()["content-security-policy"]).not.toContain(
    "script-src 'unsafe-inline'",
  );
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).display).toBe("standalone");
  await waitForRuntime(page);
  await waitForServiceWorker(page);
});

test("allows only one active page per origin", async ({ page, context }) => {
  await page.goto("/");
  await waitForRuntime(page);

  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await expect(secondPage.getByText("Budgie is already open")).toBeVisible();
});

test("uses shared services through the browser application API", async ({
  page,
}) => {
  await page.goto("/");
  await waitForRuntime(page);

  const account = await page.evaluate(async () => {
    const created = await window.api.createAccount({
      name: "Browser contract account",
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
    const [
      accounts,
      categories,
      transactions,
      scheduled,
      settings,
      payees,
      envelopes,
      allocations,
      transfers,
    ] = await Promise.all([
      window.api.getAccounts(),
      window.api.getCategories(),
      window.api.getTransactions(),
      window.api.getScheduledTransactions(),
      window.api.getSettings(),
      window.api.getPayees(),
      window.api.getAllEnvelopesIncludingInactive(),
      window.api.getBudgetAllocations(),
      window.api.getBudgetTransfers(),
    ]);
    return {
      createdId: created[0]?.id,
      names: accounts.map(({ name }) => name),
      collectionLengths: [
        categories.length,
        transactions.length,
        scheduled.length,
        settings.length,
        payees.length,
        envelopes.length,
        allocations.length,
        transfers.length,
      ],
    };
  });

  expect(account.createdId).toBeGreaterThan(0);
  expect(account.names).toContain("Browser contract account");
  expect(account.collectionLengths).toHaveLength(8);
});

test("waits for a service-worker update instead of replacing the active session", async ({
  page,
}) => {
  await page.goto("/");
  await waitForRuntime(page);
  await page.reload();
  await waitForRuntime(page);
  await waitForServiceWorker(page);
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);

  const controllerBefore = await page.evaluate(
    () => navigator.serviceWorker.controller?.scriptURL,
  );
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.register(
      "./sw.js?version=2",
      { scope: "./" },
    );
    await registration.update();
  });
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    window.dispatchEvent(
      new CustomEvent("budgie:service-worker-update", {
        detail: registration,
      }),
    );
  });
  await expect(page.getByText("A new Budgie version is ready")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller?.scriptURL),
    )
    .toBe(controllerBefore);
});

test("reloads from the service-worker cache while offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForRuntime(page);
  await page.reload();
  await waitForRuntime(page);
  await waitForServiceWorker(page);
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await waitForRuntime(page);
  await expect(page.locator("#root")).not.toContainText("could not start");
});
