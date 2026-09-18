import * as schema from "@/main/db/schema";
import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import {
  createPortableData,
  importPortableData,
  parsePortableData,
  serializePortableData,
} from "@/services/portable-data";
import goldenPackage from "@/tests/fixtures/portable-data-v1.json";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

const createDatabase = (): DatabaseCapability => {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  migrate(drizzle(sqlite, { schema }), {
    migrationsFolder: "src/main/db/migrations",
  });

  const transaction = (): DatabaseTransaction => ({
    execute: async (statement) => {
      sqlite.prepare(statement.sql).run(...(statement.params ?? []));
    },
    query: async <T extends DatabaseRow>(statement: DatabaseStatement) =>
      sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as T[],
  });

  return {
    execute: async (statement) => {
      sqlite.prepare(statement.sql).run(...(statement.params ?? []));
    },
    query: async <T extends DatabaseRow>(statement: DatabaseStatement) =>
      sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as T[],
    transaction: async <T>(
      operation: (tx: DatabaseTransaction) => Promise<T>,
    ) => {
      sqlite.exec("BEGIN;");
      try {
        const result = await operation(transaction());
        sqlite.exec("COMMIT;");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK;");
        throw error;
      }
    },
    migrate: async () => undefined,
    close: async () => sqlite.close(),
  };
};

describe("portable data export", () => {
  it("reads the version 1 empty golden package", async () => {
    await expect(
      parsePortableData(JSON.stringify(goldenPackage)),
    ).resolves.toEqual(goldenPackage);
  });

  it("rejects duplicate IDs and broken relationships before import", async () => {
    const duplicate = {
      ...goldenPackage,
      accounts: [{ publicId: "same" }, { publicId: "same" }],
    };
    await expect(parsePortableData(JSON.stringify(duplicate))).rejects.toThrow(
      "Duplicate accounts public ID",
    );

    const broken = {
      ...goldenPackage,
      accounts: [{ publicId: "account" }],
      transactions: [{ publicId: "transaction", accountPublicId: "missing" }],
    };
    await expect(parsePortableData(JSON.stringify(broken))).rejects.toThrow(
      "Invalid accounts relationship reference",
    );
  });

  it("round-trips the golden package through a second database", async () => {
    const database = createDatabase();
    await importPortableData(database, goldenPackage);
    const exported = await createPortableData(database, {
      applicationVersion: goldenPackage.manifest.applicationVersion,
      minimumReaderVersion: goldenPackage.manifest.minimumReaderVersion,
      exportedAt: goldenPackage.manifest.exportedAt,
    });
    expect(exported.preferences).toEqual({});
    expect(exported.accounts.every((row) => row.deletedAt !== null)).toBe(true);
    await expect(parsePortableData(JSON.stringify(exported))).resolves.toEqual(
      exported,
    );
  });

  it("exports a moderate large dataset with stable ordering", async () => {
    const database = createDatabase();
    for (let index = 0; index < 250; index += 1) {
      await database.execute({
        sql: `INSERT INTO accounts
            (public_id, updated_at, name, type, balance, currency)
            VALUES (?, ?, ?, ?, ?, ?)`,
        params: [
          `account-${index}`,
          "2026-09-18T00:00:00.000Z",
          `Account ${index}`,
          "cash",
          index,
          "GBP",
        ],
      });
    }
    const exported = await createPortableData(database, {
      applicationVersion: "0.16.3",
      minimumReaderVersion: "0.16.3",
      exportedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(exported.accounts).toHaveLength(250);
    expect(exported.accounts[0]?.publicId).toBe("account-0");
    expect(exported.accounts[249]?.publicId).toBe("account-249");
  });

  it("exports public-ID relationships, tombstones, preferences, and checksum", async () => {
    const database = createDatabase();
    await database.execute({
      sql: `INSERT INTO accounts
        (public_id, updated_at, name, type, balance, currency)
        VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        "account-1",
        "2026-09-18T00:00:00.000Z",
        "Checking",
        "bank",
        100,
        "GBP",
      ],
    });
    await database.execute({
      sql: `INSERT INTO categories
        (public_id, updated_at, name, expense_type)
        VALUES (?, ?, ?, ?)`,
      params: ["category-1", "2026-09-18T00:00:00.000Z", "Food", "expense"],
    });
    const [{ id: accountId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM accounts WHERE public_id = ?",
      params: ["account-1"],
    });
    const [{ id: categoryId }] = await database.query<{ id: number }>({
      sql: "SELECT id FROM categories WHERE public_id = ?",
      params: ["category-1"],
    });
    await database.execute({
      sql: `INSERT INTO transactions
        (public_id, updated_at, account_id, category_id, date, payee, amount)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        "transaction-1",
        "2026-09-18T00:00:00.000Z",
        accountId,
        categoryId,
        "2026-09-17",
        "Cafe",
        -12.5,
      ],
    });
    await database.execute({
      sql: "UPDATE categories SET deleted = 1, deleted_at = ? WHERE id = 1",
      params: ["2026-09-18T01:00:00.000Z"],
    });
    await database.execute({
      sql: "INSERT INTO settings (id, preferences) VALUES (1, ?)",
      params: [
        JSON.stringify({
          hideReconciled: true,
          hideCleared: false,
          autofillPayees: true,
          backupFolder: "Café · 日本語",
          accountShortcuts: [{ key: "1", accountId }],
        }),
      ],
    });

    const options = {
      applicationVersion: "0.16.3",
      minimumReaderVersion: "0.16.3",
      exportedAt: "2026-09-18T02:00:00.000Z",
    };
    const exported = await createPortableData(database, options);
    const repeated = await createPortableData(database, options);

    expect(exported.manifest).toEqual({
      ...options,
      formatVersion: 1,
      checksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(exported.checksum).toBe(repeated.checksum);
    expect(exported.preferences.backupFolder).toBe("Café · 日本語");
    expect(exported.accounts[0]?.publicId).toBe("account-1");
    expect(exported.categories[0]?.deletedAt).toBe("2026-09-18T01:00:00.000Z");
    expect(exported.transactions[0]).toEqual(
      expect.objectContaining({
        accountPublicId: "account-1",
        categoryPublicId: "category-1",
      }),
    );
    const serialized = await serializePortableData({
      ...exported,
    });
    expect(serialized).toContain("Café · 日本語");
    const serializedPackage = JSON.parse(serialized) as typeof exported;
    expect(serializedPackage.preferences.backupFolder).toBe("Café · 日本語");
    expect(await parsePortableData(serialized)).toEqual(serializedPackage);

    const parsed = await parsePortableData(
      JSON.stringify({ ...exported, preferences: { ...exported.preferences } }),
    );
    expect(parsed.preferences).toEqual(exported.preferences);

    await expect(parsePortableData("{broken")).rejects.toThrow(
      "Invalid portable data JSON",
    );
    await expect(
      parsePortableData(
        JSON.stringify({
          ...exported,
          manifest: { ...exported.manifest, formatVersion: 2 },
        }),
      ),
    ).rejects.toThrow("Unsupported portable data format");

    await database.execute({
      sql: `INSERT INTO accounts
        (public_id, updated_at, name, type, balance, currency)
        VALUES (?, ?, ?, ?, ?, ?)`,
      params: [
        "local-only-account",
        "2026-09-18T03:00:00.000Z",
        "Local Only",
        "cash",
        10,
        "GBP",
      ],
    });
    await importPortableData(database, exported);
    const [localOnly] = await database.query<{ deleted_at: string | null }>({
      sql: "SELECT deleted_at FROM accounts WHERE public_id = ?",
      params: ["local-only-account"],
    });
    expect(localOnly?.deleted_at).not.toBeNull();

    await expect(
      importPortableData(database, {
        ...exported,
        manifest: { ...exported.manifest, checksum: "bad" },
      }),
    ).rejects.toThrow("checksum mismatch");
    const [stillTombstoned] = await database.query<{
      deleted_at: string | null;
    }>({
      sql: "SELECT deleted_at FROM accounts WHERE public_id = ?",
      params: ["local-only-account"],
    });
    expect(stillTombstoned?.deleted_at).not.toBeNull();
    const [restoredSettings] = await database.query<{ preferences: string }>({
      sql: "SELECT preferences FROM settings WHERE id = 1",
    });
    expect(JSON.parse(restoredSettings.preferences).accountShortcuts).toEqual([
      { key: "1", accountId },
    ]);
  });
});
