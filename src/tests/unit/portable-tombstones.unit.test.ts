// SY-029: portable import and export with the tombstone store (migration
// 0015). A package may hold a deleted and a live row with the same natural
// key (a server snapshot can); the deleted one is kept in the store, and the
// store is exported with its table so nothing is lost.
import {
  createPortableData,
  sealPortableData,
  type PortableData,
} from "@/services/portable-data";
import { importPortableData } from "@/services/portable-import";
import { readTombstones } from "@/services/tombstone-store";
import {
  createCapabilityDatabase,
  PORTABLE_FIXTURE_OPTIONS,
} from "@/tests/helpers/portable-fixture";
import { afterEach, describe, expect, it } from "vitest";

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const fresh = () => {
  const { database, close } = createCapabilityDatabase();
  closers.push(close);
  return database;
};

const T = "2026-11-22 10:00:00";
const DELETED = "2026-11-22 11:00:00";
const sync = (publicId: string, deletedAt: string | null = null) => ({
  publicId,
  createdAt: T,
  updatedAt: T,
  deletedAt,
});

/** A package holding, for each natural-key table, a deleted and a live row with one key. */
const collidingPackage = async (): Promise<PortableData> => {
  const base = await createPortableData(fresh(), PORTABLE_FIXTURE_OPTIONS);
  const category = base.categories.find(
    (row) => row.expenseType === "expense",
  );
  if (!category) throw new Error("no expense category");
  const envelope = "e0e0e0e0-0000-4000-8000-000000000001";
  return sealPortableData({
    ...base,
    envelopes: [{ ...sync(envelope), name: "Food", active: true, sortOrder: 0 }],
    payees: [
      {
        ...sync("11111111-1111-4111-8111-111111111111", DELETED),
        name: "Tesco",
        categoryPublicId: null,
        amount: 1,
      },
      {
        ...sync("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
        name: "Tesco",
        categoryPublicId: null,
        amount: 2,
      },
    ],
    envelopeCategories: [
      {
        ...sync("dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
        envelopePublicId: envelope,
        categoryPublicId: category.publicId,
      },
      {
        ...sync("22222222-2222-4222-8222-222222222222", DELETED),
        envelopePublicId: envelope,
        categoryPublicId: category.publicId,
      },
    ],
    budgetAllocations: [
      {
        ...sync("33333333-3333-4333-8333-333333333333", DELETED),
        envelopePublicId: envelope,
        month: "2026-12",
        assigned: 300,
      },
      {
        ...sync("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
        envelopePublicId: envelope,
        month: "2026-12",
        assigned: 400,
      },
    ],
  });
};

const liveIds = async (
  database: ReturnType<typeof fresh>,
  table: string,
) =>
  (
    await database.query<{ public_id: string }>({
      sql: `SELECT public_id FROM ${table} WHERE deleted_at IS NULL`,
    })
  ).map((row) => row.public_id);

describe("portable data and the tombstone store", () => {
  it("imports a deleted and a live row with the same natural key", async () => {
    const data = await collidingPackage();
    const database = fresh();
    await importPortableData(database, data);

    expect(await liveIds(database, "payees")).toEqual([
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    ]);
    expect(await liveIds(database, "envelope_categories")).toEqual([
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    ]);
    expect(await liveIds(database, "budget_allocations")).toEqual([
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ]);
    for (const [table, publicId] of [
      ["payees", "11111111-1111-4111-8111-111111111111"],
      ["envelope_categories", "22222222-2222-4222-8222-222222222222"],
      ["budget_allocations", "33333333-3333-4333-8333-333333333333"],
    ] as const) {
      const stored = await readTombstones(database, table);
      expect(stored.map((row) => row.publicId)).toEqual([publicId]);
      expect(stored[0]?.payload.deletedAt).toBe(DELETED);
    }
  });

  it("exports stored rows and round-trips them through import", async () => {
    const data = await collidingPackage();
    const source = fresh();
    await importPortableData(source, data);
    const exported = await createPortableData(source, PORTABLE_FIXTURE_OPTIONS);
    for (const collection of [
      "payees",
      "envelopeCategories",
      "budgetAllocations",
    ] as const) {
      expect(
        exported[collection].map((row) => row.publicId).sort(),
      ).toEqual(data[collection].map((row) => row.publicId).sort());
    }

    const target = fresh();
    await importPortableData(target, exported);
    const again = await createPortableData(target, PORTABLE_FIXTURE_OPTIONS);
    expect(again.payees).toEqual(exported.payees);
    expect(again.envelopeCategories).toEqual(exported.envelopeCategories);
    expect(again.budgetAllocations).toEqual(exported.budgetAllocations);

    // Importing the same package again over itself also works.
    await importPortableData(target, exported);
    expect(await liveIds(target, "payees")).toEqual([
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    ]);
  });

  it("keeps a local row that an import displaces as a stored tombstone", async () => {
    const database = fresh();
    await database.execute({
      sql: "INSERT INTO payees (public_id, name) VALUES ('local-payee', 'Tesco')",
    });
    await importPortableData(database, await collidingPackage());
    const stored = await readTombstones(database, "payees");
    expect(stored.map((row) => row.publicId).sort()).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "local-payee",
    ]);
    expect(stored.every((row) => row.dirty && row.unsealed)).toBe(true);
  });
});
