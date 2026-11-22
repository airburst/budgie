// SY-044: two browsers sync through the real server, with no network mocks.
// Runs in the `sync-real` project (playwright.config.ts): a build whose sync
// URL is the Worker on celld (scripts/e2e-sync-server.ts), which starts with
// an empty database on every run. The user and the first invite are seeded
// here through the server's DEV_MODE admin route.
import { expect, test, type Page } from "@playwright/test";

const SERVER = "http://127.0.0.1:4600";

const section = (page: Page) =>
  page.getByRole("region", { name: "Sync", exact: true });
const indicator = (page: Page) =>
  page.getByRole("link", { name: /^Sync status:/ });

async function openSettings(page: Page) {
  await page.goto("/#/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(section(page)).toBeVisible();
}

async function consentAndConnect(page: Page, code: string, name: string) {
  await openSettings(page);
  await section(page).getByRole("button", { name: "Turn on sync" }).click();
  await page.getByLabel(/I understand, and I agree/).check();
  await section(page).getByRole("button", { name: "Continue" }).click();
  await section(page).getByLabel("Code").fill(code);
  await section(page).getByLabel("Device name").fill(name);
  await section(page).getByRole("button", { name: "Connect" }).click();
}

async function accountId(page: Page, name: string): Promise<number> {
  await page.waitForFunction(() => Boolean(window.api));
  const id = await page.evaluate(
    async (n) => (await window.api.getAccounts()).find((a) => a.name === n)?.id,
    name,
  );
  if (id === undefined) throw new Error(`No account named ${name}`);
  return id;
}

/**
 * After a local write: the indicator goes to pending, then the background
 * scheduler pushes it (about 5 s later). Waiting for "pending" first matters:
 * right after a save the indicator can still show the previous "synced".
 */
async function expectPushedInBackground(page: Page) {
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "pending");
  await expect(indicator(page)).toHaveAttribute("data-sync-state", "synced", {
    timeout: 20_000,
  });
}

/** The register row for a payee, by its Edit button (desktop layout). */
const editButton = (page: Page, payee: string) =>
  page.getByRole("button", { name: `Edit ${payee}`, exact: true });

async function seedInvite(): Promise<string> {
  // A unique name (user names are unique), so a retry or a parallel repeat
  // gets its own user on the same server.
  const res = await fetch(`${SERVER}/dev/admin/add-user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `e2e-${crypto.randomUUID()}` }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

test("two browsers sync a transaction and an edit through the real server", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const invite = await seedInvite();
  const account = `Real sync ${Date.now()}`;
  const payee = "Corner Shop";

  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });
  try {
    const a = await contextA.newPage();
    const b = await contextB.newPage();
    for (const p of [a, b]) await p.setViewportSize({ width: 1280, height: 900 });

    // A: an account exists locally before sync is turned on.
    await a.goto("/");
    await a.waitForFunction(() => Boolean(window.api));
    await a.evaluate(async (name) => {
      await window.api.createAccount({
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
    }, account);

    // A: consent, enrol with the invite, Start (the server is empty).
    await consentAndConnect(a, invite, "Browser A");
    await expect(a.getByTestId("sync-start")).toBeVisible();
    await section(a).getByRole("button", { name: "Start sync" }).click();
    await expect(a.getByTestId("sync-status-panel")).toBeVisible();
    await expect(indicator(a)).toHaveAttribute("data-sync-state", "synced");

    // A: add a transaction through the register.
    const idA = await accountId(a, account);
    await a.goto(`/#/accounts/${idA}`);
    await a.getByRole("button", { name: "Add", exact: true }).click();
    await a.getByPlaceholder("e.g. Starbucks, Amazon...").fill(payee);
    await a.getByLabel("Withdrawal").fill("12.34");
    await a.getByRole("button", { name: "Add Transaction" }).click();
    await expect(editButton(a, payee)).toBeVisible();
    await expectPushedInBackground(a);

    // A: a device code for B, from the devices list.
    await openSettings(a);
    await a.getByRole("button", { name: "Add a device" }).click();
    const codeBox = a.getByTestId("sync-device-code");
    await expect(codeBox).toContainText("Your code");
    const deviceCode = (
      await codeBox.locator("p.font-mono").textContent()
    )?.trim();
    expect(deviceCode).toMatch(/^[0-9A-Z-]+$/);

    // B: consent, enrol with the device code, Join (the server has data).
    await consentAndConnect(b, deviceCode!, "Browser B");
    await expect(b.getByTestId("sync-join")).toBeVisible();
    await b
      .getByRole("button", { name: "Join and replace this device's data" })
      .click();
    await b.getByRole("button", { name: "Replace and join" }).click();
    await expect(b.getByTestId("sync-status-panel")).toBeVisible();
    await expect(b.getByTestId("sync-device")).toHaveCount(2);

    // B: sees A's transaction and edits it.
    const idB = await accountId(b, account);
    await b.goto(`/#/accounts/${idB}`);
    await expect(editButton(b, payee)).toBeVisible();
    await expect(b.getByText("12.34").first()).toBeVisible();
    await editButton(b, payee).click();
    await expect(b.getByText("Edit Transaction")).toBeVisible();
    await b.getByLabel("Withdrawal").fill("56.78");
    await b.getByRole("button", { name: "Save Changes" }).click();
    await expect(b.getByText("56.78").first()).toBeVisible();
    await expectPushedInBackground(b);

    // A: "Sync now" pulls B's edit.
    await openSettings(a);
    await a.getByRole("button", { name: "Sync now" }).click();
    await expect(a.getByTestId("sync-state")).toContainText("Up to date");
    await a.goto(`/#/accounts/${idA}`);
    await expect(editButton(a, payee)).toBeVisible();
    await expect(a.getByText("56.78").first()).toBeVisible();
    await expect(a.getByText("12.34")).toHaveCount(0);

    // Reloading either keeps the state, and sync stays on.
    for (const [p, id] of [
      [a, idA],
      [b, idB],
    ] as const) {
      await p.reload();
      await expect(p).toHaveURL(new RegExp(`#/accounts/${id}$`));
      await expect(editButton(p, payee)).toBeVisible();
      await expect(p.getByText("56.78").first()).toBeVisible();
      await expect(indicator(p)).toHaveAttribute("data-sync-state", "synced");
      const amounts = await p.evaluate(
        async ([accId, name]) =>
          (await window.api.getTransactionsByAccount(accId as number))
            .filter((t) => t.payee === name)
            .map((t) => t.amount),
        [id, payee] as const,
      );
      expect(amounts).toEqual([-56.78]);
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
