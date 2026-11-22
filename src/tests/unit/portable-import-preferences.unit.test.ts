import type { DatabaseCapability } from "@/platform/database";
import {
  createPortableData,
  importPortableData,
  sealPortableData,
  type PortableData,
} from "@/services/portable-data";
import {
  PORTABLE_FIXTURE_OPTIONS,
  buildPortableFixtureDatabase,
  createCapabilityDatabase,
} from "@/tests/helpers/portable-fixture";
import { afterEach, describe, expect, it } from "vitest";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const fresh = (): DatabaseCapability => {
  const { database, close } = createCapabilityDatabase();
  closers.push(close);
  return database;
};

const fixture = async () => {
  const { database, close } = await buildPortableFixtureDatabase();
  closers.push(close);
  return database;
};

describe("portable import preferences", () => {
  const exportOf = async (
    database: DatabaseCapability,
  ): Promise<PortableData> =>
    createPortableData(database, PORTABLE_FIXTURE_OPTIONS);

  const settings = async (database: DatabaseCapability) => {
    const [row] = await database.query<{ preferences: string }>({
      sql: "SELECT preferences FROM settings WHERE id = 1",
    });
    return row?.preferences;
  };

  it("keeps the settings row when the package preferences are empty", async () => {
    const source = await fixture();
    const exported = await exportOf(source);
    const target = fresh();
    await importPortableData(target, exported);
    const stored = JSON.stringify({
      hideReconciled: false,
      backupFolder: "Mine",
    });
    await target.execute({
      sql: "UPDATE settings SET preferences = ? WHERE id = 1",
      params: [stored],
    });
    await importPortableData(
      target,
      await sealPortableData({ ...exported, preferences: {} }),
    );
    expect(await settings(target)).toBe(stored);
  });

  it("does not create a settings row from empty preferences", async () => {
    const source = await fixture();
    const exported = await sealPortableData({
      ...(await exportOf(source)),
      preferences: {},
    });
    const target = fresh();
    await importPortableData(target, exported);
    expect(await settings(target)).toBeUndefined();
  });

  it("replaces the settings when the package preferences are not empty", async () => {
    const source = await fixture();
    const exported = await exportOf(source);
    const target = fresh();
    await target.execute({
      sql: "INSERT INTO settings (id, preferences) VALUES (1, ?)",
      params: [JSON.stringify({ backupFolder: "Old" })],
    });
    await importPortableData(target, exported);
    const prefs = JSON.parse((await settings(target)) ?? "{}");
    expect(prefs.backupFolder).toBe("Café");
    const accounts = await target.query<{ id: number; public_id: string }>({
      sql: "SELECT id, public_id FROM accounts",
    });
    const byId = new Map(accounts.map((row) => [row.id, row.public_id]));
    expect(
      prefs.accountShortcuts.map(
        (shortcut: { key: string; accountId: number }) => [
          shortcut.key,
          byId.get(shortcut.accountId),
        ],
      ),
    ).toEqual([
      ["1", "acc-current"],
      ["2", "acc-savings"],
    ]);
  });

  it("drops kept shortcuts whose account no longer resolves, remapping the rest", async () => {
    const source = await fixture();
    const exported = await exportOf(source);
    const target = fresh();
    await importPortableData(target, exported);
    const idOf = async (publicId: string) =>
      (
        await target.query<{ id: number }>({
          sql: "SELECT id FROM accounts WHERE public_id = ?",
          params: [publicId],
        })
      )[0]!.id;
    await target.execute({
      sql: "UPDATE settings SET preferences = ? WHERE id = 1",
      params: [
        JSON.stringify({
          backupFolder: "Mine",
          accountShortcuts: [
            { key: "1", accountId: await idOf("acc-current") },
            { key: "2", ctrl: true, accountId: await idOf("acc-savings") },
            { key: "3", accountId: 9999 },
          ],
        }),
      ],
    });
    // The new package no longer has the savings account.
    const smaller = await sealPortableData({
      ...exported,
      preferences: {},
      accounts: exported.accounts.filter(
        (row) => row.publicId !== "acc-savings",
      ),
      transactions: exported.transactions
        .filter((row) => row.accountPublicId !== "acc-savings")
        .map((row) => ({ ...row, transferTransactionPublicId: null })),
      scheduledTransactions: [],
    });
    await importPortableData(target, smaller);
    const prefs = JSON.parse((await settings(target)) ?? "{}");
    expect(prefs.backupFolder).toBe("Mine");
    expect(prefs.accountShortcuts).toEqual([
      { key: "1", accountId: await idOf("acc-current") },
    ]);
  });
});
