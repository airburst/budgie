/**
 * Export an Electron SQLite file as a Portable Data Package (JSON) that the web
 * app's Settings -> Import can load. Useful for moving a real dataset onto a
 * phone or tablet for testing.
 *
 *   bun run export:portable [db-path] [-o out.json] [--force]
 *
 * db-path defaults to ~/budgie.db. The source is never modified: it is read
 * through SQLite's backup API (safe while Electron is running), and the copy is
 * migrated to the current schema before export so older databases work too.
 */
import * as schema from "@/main/db/schema";
import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import {
  createPortableData,
  parsePortableData,
  serializePortableData,
} from "@/services/portable-data";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json";

const migrationsFolder = fileURLToPath(
  new URL("../src/main/db/migrations", import.meta.url),
);

const capabilityFor = (sqlite: Database.Database): DatabaseCapability => {
  const run = (statement: DatabaseStatement) =>
    sqlite.prepare(statement.sql).run(...(statement.params ?? []));
  const all = <T extends DatabaseRow>(statement: DatabaseStatement) =>
    sqlite.prepare(statement.sql).all(...(statement.params ?? [])) as T[];
  const transaction: DatabaseTransaction = {
    execute: async (statement) => {
      run(statement);
    },
    query: async <T extends DatabaseRow>(statement: DatabaseStatement) =>
      all<T>(statement),
  };
  return {
    execute: transaction.execute,
    query: transaction.query,
    transaction: async <T>(
      operation: (tx: DatabaseTransaction) => Promise<T>,
    ) => {
      sqlite.exec("BEGIN;");
      try {
        const result = await operation(transaction);
        sqlite.exec("COMMIT;");
        return result;
      } catch (error) {
        sqlite.exec("ROLLBACK;");
        throw error;
      }
    },
    migrate: async () => {
      migrate(drizzle(sqlite, { schema }), { migrationsFolder });
    },
    close: async () => {
      sqlite.close();
    },
  };
};

export type ExportSummary = Record<string, number>;

export async function exportPortableFromFile(
  dbPath: string,
  outPath: string,
  options: { force?: boolean } = {},
): Promise<ExportSummary> {
  const source = resolve(dbPath);
  const target = resolve(outPath);
  if (!existsSync(source)) throw new Error(`Database not found: ${source}`);
  if (source === target) throw new Error("Output must not be the database");
  if (existsSync(target) && !options.force) {
    throw new Error(`${target} exists; pass --force to overwrite`);
  }

  const workDir = await mkdtemp(join(tmpdir(), "budgie-export-"));
  try {
    const copyPath = join(workDir, "snapshot.db");
    const original = new Database(source, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      await original.backup(copyPath);
    } finally {
      original.close();
    }

    const sqlite = new Database(copyPath);
    const database = capabilityFor(sqlite);
    try {
      await database.migrate();
      const data = await createPortableData(database, {
        applicationVersion: packageJson.version,
        minimumReaderVersion: packageJson.version,
      });
      const document = await serializePortableData(data);
      await parsePortableData(document); // round-trip check before writing
      await writeFile(target, document, { mode: 0o600 });
      return {
        accounts: data.accounts.length,
        categories: data.categories.length,
        transactions: data.transactions.length,
        scheduledTransactions: data.scheduledTransactions.length,
        payees: data.payees.length,
        envelopes: data.envelopes.length,
        budgetAllocations: data.budgetAllocations.length,
      };
    } finally {
      await database.close();
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

const usage = "Usage: bun run export:portable [db-path] [-o out.json] [--force]";

async function main(argv: string[]) {
  let dbPath = join(homedir(), "budgie.db");
  let outPath = join(process.cwd(), "budgie-export.json");
  let force = false;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "-o" || arg === "--out") outPath = argv[++i] ?? "";
    else if (arg === "--force") force = true;
    else if (arg === "-h" || arg === "--help") return console.log(usage);
    else positional.push(arg);
  }
  if (positional[0]) dbPath = positional[0];
  if (!outPath || positional.length > 1) return console.error(usage);

  const summary = await exportPortableFromFile(dbPath, outPath, { force });
  console.log(`Exported ${resolve(dbPath)} -> ${resolve(outPath)}`);
  for (const [name, count] of Object.entries(summary)) {
    console.log(`  ${name}: ${count}`);
  }
  console.log("Contains real financial data: don't commit or share it.");
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
