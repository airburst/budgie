import {
  column,
  PowerSyncDatabase,
  Schema,
  Table,
  WASQLiteVFS,
} from "@powersync/web";
import { browserMigrations } from "../../src/web/db/migrations";

const output = document.querySelector<HTMLPreElement>("#output");
if (!output) throw new Error("PowerSync spike output element is missing");

const statementsFor = (sql: string) =>
  sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);

const spikeSchema = new Schema({
  spikeRows: new Table({ label: column.text }, { localOnly: true }),
});

const migrationTable = "__powersync_spike_migrations";

const createDatabase = (vfs: WASQLiteVFS, filename: string) =>
  new PowerSyncDatabase({
    schema: spikeSchema,
    database: {
      dbFilename: filename,
      vfs,
      enableMultiTabs: false,
    },
  });

const applyMigrations = async (db: PowerSyncDatabase) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${migrationTable} (
      tag TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
    )
  `);

  const applied: string[] = [];
  const skipped: string[] = [];
  const existing = await db.getAll<{ tag: string }>(
    `SELECT tag FROM ${migrationTable}`,
  );
  const existingTags = new Set(existing.map(({ tag }) => tag));

  for (const migration of browserMigrations) {
    if (existingTags.has(migration.tag)) {
      skipped.push(migration.tag);
      continue;
    }

    await db.writeTransaction(async (transaction) => {
      for (const statement of statementsFor(migration.sql)) {
        await transaction.execute(statement);
      }
      await transaction.execute(
        `INSERT INTO ${migrationTable} (tag, created_at) VALUES (?, ?)`,
        [migration.tag, migration.folderMillis],
      );
    });
    applied.push(migration.tag);
  }

  return { applied, skipped };
};

const runVfsProbe = async (vfs: WASQLiteVFS, filename: string) => {
  const first = createDatabase(vfs, filename);
  const firstMigrations = await applyMigrations(first);
  await first.execute(
    "CREATE TABLE IF NOT EXISTS __powersync_spike_contract (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
  );
  const existingContractRows = await first.getAll<{ id: number }>(
    "SELECT id FROM __powersync_spike_contract WHERE id = ?",
    [1],
  );
  if (existingContractRows.length === 0) {
    await first.execute(
      "INSERT INTO __powersync_spike_contract (id, value) VALUES (?, ?) RETURNING id",
      [1, "first-load"],
    );
  }

  let rollbackObserved = false;
  try {
    await first.writeTransaction(async (transaction) => {
      await transaction.execute(
        "INSERT INTO __powersync_spike_contract (id, value) VALUES (?, ?)",
        [2, "rolled-back"],
      );
      throw new Error("intentional rollback");
    });
  } catch (error) {
    rollbackObserved =
      error instanceof Error && error.message === "intentional rollback";
  }

  const firstRows = await first.getAll<{ id: number; value: string }>(
    "SELECT id, value FROM __powersync_spike_contract ORDER BY id",
  );
  await first.close();

  const second = createDatabase(vfs, filename);
  const secondMigrations = await applyMigrations(second);
  const reloadedRows = await second.getAll<{ id: number; value: string }>(
    "SELECT id, value FROM __powersync_spike_contract ORDER BY id",
  );
  await second.close();

  return {
    vfs,
    firstMigrations,
    secondMigrations,
    firstRows,
    reloadedRows,
    rollbackObserved,
  };
};

const run = async () => {
  const results = [];
  for (const [name, vfs] of [
    ["AccessHandlePoolVFS", WASQLiteVFS.AccessHandlePoolVFS],
    ["OPFSCoopSyncVFS", WASQLiteVFS.OPFSCoopSyncVFS],
  ] as const) {
    try {
      results.push(await runVfsProbe(vfs, `powersync-spike-${name}.db`));
    } catch (error) {
      results.push({
        vfs: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  output.textContent = JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      crossOriginIsolated: window.crossOriginIsolated,
      persisted: await navigator.storage?.persisted(),
      results,
    },
    null,
    2,
  );
};

void run().catch((error) => {
  output.textContent = JSON.stringify(
    { error: error instanceof Error ? error.message : String(error) },
    null,
    2,
  );
});
