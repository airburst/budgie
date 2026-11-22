// Pins the portable export byte for byte. The golden files were produced by the
// code as it stood before the per-table row codec refactor (SY-024), so a pass
// proves export and import still produce identical output.
//
// To regenerate deliberately (only when the portable format changes):
//   UPDATE_PORTABLE_GOLDEN=1 bun run test portable-data.golden
import {
  type PortableData,
  createPortableData,
  importPortableData,
  serializePortableData,
} from "@/services/portable-data";
import {
  PORTABLE_FIXTURE_OPTIONS,
  buildPortableFixtureDatabase,
  createCapabilityDatabase,
} from "@/tests/helpers/portable-fixture";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const exportGolden = "src/tests/fixtures/portable-export-golden.txt";
const importGolden = "src/tests/fixtures/portable-import-roundtrip-golden.txt";

const check = (path: string, actual: string) => {
  if (import.meta.env.UPDATE_PORTABLE_GOLDEN) writeFileSync(path, actual);
  expect(actual).toBe(readFileSync(path, "utf8"));
};

// Seeded categories get their timestamps from SQLite's clock at migration and
// tombstone time, which varies per run. Blank them (and the checksum, which
// covers them) so the rest of the export is compared byte for byte.
//
// The import also bumps updatedAt on rows that go through the second pass
// (category parents, transfer links) because the sync-metadata UPDATE trigger
// fires when a row is rewritten with an unchanged updated_at. That time is
// run-dependent too, so `second pass` rows are blanked after an import.
const stable = (data: PortableData, afterImport = false) =>
  JSON.stringify({
    ...data,
    categories: data.categories.map((row) =>
      row.publicId.startsWith("legacy:")
        ? { ...row, createdAt: null, updatedAt: null, deletedAt: null }
        : afterImport
          ? { ...row, updatedAt: null }
          : row,
    ),
    transactions: afterImport
      ? data.transactions.map((row) => ({ ...row, updatedAt: null }))
      : data.transactions,
    manifest: { ...data.manifest, checksum: "" },
  });

describe("portable export golden", () => {
  it("exports the fixture database byte for byte", async () => {
    const { database, close } = await buildPortableFixtureDatabase();
    const exported = await createPortableData(
      database,
      PORTABLE_FIXTURE_OPTIONS,
    );
    await serializePortableData(exported);
    check(exportGolden, stable(exported));
    close();
  });

  it("re-exports an import of the fixture byte for byte", async () => {
    const source = await buildPortableFixtureDatabase();
    const exported = await createPortableData(
      source.database,
      PORTABLE_FIXTURE_OPTIONS,
    );
    source.close();

    const target = createCapabilityDatabase();
    await importPortableData(target.database, exported);
    const again = await createPortableData(
      target.database,
      PORTABLE_FIXTURE_OPTIONS,
    );
    check(importGolden, stable(again, true));
    target.close();
  });
});
