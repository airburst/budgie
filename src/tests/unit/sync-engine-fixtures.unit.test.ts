// @vitest-environment node
// SY-026: the real sync engine runs every merge fixture in
// sync-server/contract/fixtures/, following fixtures/README.md ("How a
// harness runs one merge fixture"), against a migrated in-memory database.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DatabaseCapability, DatabaseRow } from "@/platform/database";
import {
  applyPortableRow,
  createReferenceResolver,
  loadPublicIdLookup,
  PORTABLE_TABLES,
  resolveSecondPassReferences,
  type PortableTable,
} from "@/services/portable-data";
import { encodeSyncRow } from "@/services/sync/codec";
import { runSyncRound } from "@/services/sync/engine";
import { applyErrorCode } from "@/services/sync/errors";
import type {
  SyncEnvelope,
  SyncRejection,
  SyncRequest,
} from "@/services/sync/payload";
import { readTombstones } from "@/services/tombstone-store";
import { createCapabilityDatabase } from "@/tests/helpers/portable-fixture";
import { afterEach, describe, expect, it } from "vitest";

type Payload = Record<string, unknown> & { publicId: string };
type LocalRow = {
  tbl: PortableTable;
  hlc: string | null;
  dirty: boolean;
  unsealed: boolean;
  payload: Payload;
  local?: Record<string, unknown>;
};
type MergeFixture = {
  kind: "merge";
  id: string;
  formatVersion: number;
  device: { deviceId: string; now: number };
  given: LocalRow[];
  editsInFlight?: Array<{ tbl: PortableTable; payload: Payload }>;
  response: {
    pull: SyncEnvelope[];
    rejected: SyncRejection[];
    formatVersion?: number;
  };
  expect: {
    push: SyncEnvelope[];
    rows: LocalRow[];
    error: "missing_reference" | "invalid_envelope" | null;
  };
};

const fixturesDir = fileURLToPath(
  new URL("../../../sync-server/contract/fixtures/", import.meta.url),
);
const fixtures = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map(
    (name) =>
      JSON.parse(readFileSync(`${fixturesDir}${name}`, "utf8")) as {
        kind: string;
        id?: string;
      },
  );
const mergeFixtures = fixtures.filter(
  (fixture): fixture is MergeFixture => fixture.kind === "merge",
);

const LOCAL_FIELDS: Partial<Record<PortableTable, string[]>> = {
  accounts: ["pendingReconcileBalance", "pendingReconcileDate"],
};

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const emptyStore = async (): Promise<DatabaseCapability> => {
  const { database, close } = createCapabilityDatabase();
  closers.push(close);
  // "Tables not mentioned are empty": remove the seeded categories (only
  // categories are seeded), lifting the no-hard-delete guard meanwhile.
  const [guard] = await database.query<{ sql: string }>({
    sql: "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'categories_no_hard_delete'",
  });
  if (!guard) throw new Error("categories_no_hard_delete trigger not found");
  await database.execute({ sql: "DROP TRIGGER categories_no_hard_delete" });
  await database.execute({ sql: "UPDATE categories SET parent_id = NULL" });
  await database.execute({ sql: "DELETE FROM categories" });
  await database.execute({ sql: guard.sql });
  return database;
};

const withLocal = (row: { tbl: PortableTable; payload: Payload }, local = {}) => {
  const fields = LOCAL_FIELDS[row.tbl] ?? [];
  return {
    ...Object.fromEntries(fields.map((field) => [field, null])),
    ...local,
    ...row.payload,
  };
};

/** Step 1: load rows exactly as written; loading is not a local edit. */
const loadGiven = async (database: DatabaseCapability, given: LocalRow[]) =>
  database.transaction(async (transaction) => {
    const resolver = createReferenceResolver(transaction);
    const ordered = PORTABLE_TABLES.flatMap((table) =>
      given.filter((row) => row.tbl === table),
    );
    for (const row of ordered) {
      await applyPortableRow(
        transaction,
        row.tbl,
        withLocal(row, row.local) as never,
        { resolver, deferSecondPass: true, incrementColumns: ["sync_rev"] },
      );
    }
    for (const row of ordered) {
      await resolveSecondPassReferences(
        transaction,
        row.tbl,
        withLocal(row, row.local) as never,
        { resolver, incrementColumns: ["sync_rev"] },
      );
      // The insert trigger marks a row without an HLC as a user insert and
      // may fill timestamps; restore everything as given.
      await transaction.execute({
        sql: `UPDATE ${row.tbl} SET hlc = ?, sync_dirty = ?, sync_unsealed = ?,
          created_at = ?, updated_at = ?, sync_rev = sync_rev + 1
          WHERE public_id = ?`,
        params: [
          row.hlc,
          Number(row.dirty),
          Number(row.unsealed),
          (row.payload.createdAt as string | null) ?? null,
          (row.payload.updatedAt as string | null) ?? null,
          row.payload.publicId,
        ],
      });
    }
  });

/** Step 5: an ordinary local edit (the triggers make it dirty and unsealed). */
const applyLocalEdit = async (
  database: DatabaseCapability,
  edit: { tbl: PortableTable; payload: Payload },
) =>
  database.transaction(async (transaction) => {
    const [existing] = await transaction.query<DatabaseRow>({
      sql: `SELECT * FROM ${edit.tbl} WHERE public_id = ?`,
      params: [edit.payload.publicId],
    });
    const skipFields = LOCAL_FIELDS[edit.tbl] ?? [];
    if (existing) {
      await applyPortableRow(transaction, edit.tbl, edit.payload as never, {
        skipFields,
      });
    } else {
      await applyPortableRow(
        transaction,
        edit.tbl,
        withLocal(edit) as never,
        {},
      );
    }
    // Keep the edit time from the payload even if it equals the old one.
    await transaction.execute({
      sql: `UPDATE ${edit.tbl} SET updated_at = ?, sync_rev = sync_rev + 1 WHERE public_id = ?`,
      params: [
        (edit.payload.updatedAt as string | null) ?? null,
        edit.payload.publicId,
      ],
    });
  });

/** Step 8: the whole store as fixture rows. */
const dumpStore = async (database: DatabaseCapability) => {
  const result: LocalRow[] = [];
  for (const table of PORTABLE_TABLES) {
    const rows = await database.query<DatabaseRow>({
      sql: `SELECT * FROM ${table}`,
    });
    if (rows.length === 0) continue;
    const publicIdOf = await database.transaction((transaction) =>
      loadPublicIdLookup(transaction, table, rows),
    );
    for (const row of rows) {
      const local = Object.fromEntries(
        (LOCAL_FIELDS[table] ?? []).map((field) => [
          field,
          row[field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] ?? null,
        ]),
      );
      result.push({
        tbl: table,
        hlc: (row.hlc as string | null) ?? null,
        dirty: row.sync_dirty === 1,
        unsealed: row.sync_unsealed === 1,
        payload: encodeSyncRow(table, row, publicIdOf) as Payload,
        ...(LOCAL_FIELDS[table] ? { local } : {}),
      });
    }
  }
  // Deleted rows in the tombstone store are part of the store (README).
  for (const table of PORTABLE_TABLES) {
    for (const stored of await readTombstones(database, table)) {
      result.push({
        tbl: table,
        hlc: stored.hlc,
        dirty: stored.dirty,
        unsealed: stored.unsealed,
        payload: stored.payload,
      });
    }
  }
  return result;
};

const byKey = <T extends { tbl: string; publicId?: string; payload: Payload }>(
  rows: T[],
) =>
  new Map(rows.map((row) => [`${row.tbl}/${row.payload.publicId}`, row]));

const runFixture = async (fixture: MergeFixture) => {
  const database = await emptyStore();
  await database.execute({
    sql: "UPDATE sync_state SET device_id = ?, token = 'fixture', cursor = '0' WHERE id = 1",
    params: [fixture.device.deviceId],
  });
  await loadGiven(database, fixture.given);

  const requests: SyncRequest[] = [];
  const round = runSyncRound(database, {
    now: () => fixture.device.now,
    transport: async (request) => {
      requests.push(request);
      if (requests.length > 1) throw new Error("A fixture has one response");
      for (const edit of fixture.editsInFlight ?? []) {
        await applyLocalEdit(database, edit);
      }
      return {
        formatVersion: fixture.response.formatVersion ?? fixture.formatVersion,
        cursor: "1:1",
        more: false,
        pull: fixture.response.pull,
        rejected: fixture.response.rejected,
      };
    },
  });
  const error = await round.then(
    () => null,
    (failure: unknown) => failure,
  );

  // Step 4: the push.
  expect(requests).toHaveLength(1);
  const pushed = byKey(requests[0]?.push ?? []);
  const expectedPush = byKey(fixture.expect.push);
  expect([...pushed.keys()].sort()).toEqual([...expectedPush.keys()].sort());
  for (const [key, envelope] of expectedPush) {
    expect(pushed.get(key), key).toEqual(envelope);
  }

  // Step 7: the error.
  if (fixture.expect.error === null) {
    expect(error).toBeNull();
  } else {
    expect(applyErrorCode(error)).toBe(fixture.expect.error);
  }

  // Step 8: the store.
  const store = byKey(await dumpStore(database));
  const expectedRows = byKey(fixture.expect.rows);
  expect([...store.keys()].sort()).toEqual([...expectedRows.keys()].sort());
  for (const [key, expected] of expectedRows) {
    const actual = store.get(key);
    expect(
      {
        hlc: actual?.hlc,
        dirty: actual?.dirty,
        unsealed: actual?.unsealed,
        payload: actual?.payload,
      },
      key,
    ).toEqual({
      hlc: expected.hlc,
      dirty: expected.dirty,
      unsealed: expected.unsealed,
      payload: expected.payload,
    });
    if (expected.local) expect(actual?.local, key).toEqual(expected.local);
  }
  if (fixture.expect.error !== null) {
    expect(await database.query({ sql: "SELECT cursor FROM sync_state" }))
      .toEqual([{ cursor: "0" }]);
  }
};

describe("sync engine conformance fixtures", () => {
  it("finds the merge fixtures", () => {
    expect(mergeFixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of mergeFixtures) {
    it(fixture.id, () => runFixture(fixture));
  }
});
