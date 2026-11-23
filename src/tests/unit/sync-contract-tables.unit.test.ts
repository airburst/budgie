// @vitest-environment node
// Guards the sync contract against drift: every Portable* row type in
// src/services/portable-data.ts must carry exactly the fields that
// sync-server/contract/tables.json lists for its table (sent fields plus the
// never-sent ones), with matching TypeScript types and nullability.
//
// The check reads the real types with the TypeScript checker, because test
// files are outside `check-types` and a type-only assertion here would never run.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ContractField = {
  name: string;
  type: string;
  nullable: boolean;
  enum?: string[];
  references?: string;
};

type ContractTable = {
  tbl: string;
  collection: string;
  portableType: string;
  applyOrder: number;
  fields: ContractField[];
  neverSent: ContractField[];
  secondPass: string[];
  naturalKeys: string[][];
};

const root = fileURLToPath(new URL("../../../", import.meta.url));
const contract = JSON.parse(
  readFileSync(`${root}sync-server/contract/tables.json`, "utf8"),
) as { formatVersion: number; tables: ContractTable[] };
const sourcePath = `${root}src/services/portable-data.ts`;

const syncedTables = [
  "accounts",
  "categories",
  "envelopes",
  "transactions",
  "account_reconciliations",
  "scheduled_transactions",
  "payees",
  "envelope_categories",
  "budget_allocations",
  "budget_transfers",
];

const tsTypeFor = (field: ContractField) => {
  const base = {
    uuid: "string",
    string: "string",
    timestamp: "string",
    date: "string",
    month: "string",
    number: "number",
    integer: "number",
    boolean: "boolean",
  }[field.type];
  if (!base) throw new Error(`Unknown contract type ${field.type}`);
  return field.nullable ? `${base} | null` : base;
};

const normalise = (text: string) =>
  text
    .split("|")
    .map((part) => part.trim())
    .sort()
    .join(" | ");

const readPortableTypes = () => {
  const program = ts.createProgram([sourcePath], {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: root,
    paths: { "@/*": ["./src/*"] },
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(sourcePath);
  if (!source) throw new Error("portable-data.ts not found");
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error("portable-data.ts has no exports");

  const types = new Map<string, Map<string, string>>();
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    if (!(symbol.flags & ts.SymbolFlags.TypeAlias)) continue;
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    const fields = new Map<string, string>();
    for (const property of checker.getPropertiesOfType(type)) {
      const declaration = property.declarations?.[0] ?? source;
      const optional = property.flags & ts.SymbolFlags.Optional ? "?" : "";
      fields.set(
        property.name,
        optional +
          checker.typeToString(
            checker.getTypeOfSymbolAtLocation(property, declaration),
          ),
      );
    }
    types.set(symbol.name, fields);
  }
  return types;
};

describe("sync contract tables.json", () => {
  const portableTypes = readPortableTypes();

  it("lists the 10 synced tables once each, in apply order", () => {
    expect(contract.formatVersion).toBe(1);
    expect(contract.tables.map((table) => table.tbl)).toEqual(syncedTables);
    expect(contract.tables.map((table) => table.applyOrder)).toEqual(
      syncedTables.map((_, index) => index + 1),
    );
  });

  it("names a Portable row type for every table and no others", () => {
    const rowTypes = [...portableTypes.keys()].filter(
      (name) =>
        /^Portable[A-Z]/.test(name) &&
        portableTypes.get(name)?.has("publicId") === true,
    );
    expect(rowTypes.sort()).toEqual(
      contract.tables.map((table) => table.portableType).sort(),
    );
  });

  it.each(contract.tables.map((table) => [table.tbl, table] as const))(
    "%s matches its Portable row type",
    (_tbl, table) => {
      const actual = portableTypes.get(table.portableType);
      expect(actual, table.portableType).toBeDefined();
      const expected = Object.fromEntries(
        [...table.fields, ...table.neverSent].map((field) => [
          field.name,
          normalise(tsTypeFor(field)),
        ]),
      );
      const found = Object.fromEntries(
        [...(actual ?? new Map<string, string>())].map(([name, text]) => [
          name,
          normalise(text),
        ]),
      );
      expect(found).toEqual(expected);
    },
  );

  it("keeps the shared metadata fields first and references valid", () => {
    const tables = new Set(syncedTables);
    for (const table of contract.tables) {
      expect(table.fields.slice(0, 4).map((field) => field.name)).toEqual([
        "publicId",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ]);
      const names = new Set(table.fields.map((field) => field.name));
      for (const field of table.fields) {
        if (field.references) {
          expect(field.type).toBe("uuid");
          expect(field.name.endsWith("PublicId")).toBe(true);
          expect(tables.has(field.references)).toBe(true);
        }
      }
      for (const name of table.secondPass) expect(names.has(name)).toBe(true);
      for (const key of table.naturalKeys) {
        for (const name of key) expect(names.has(name)).toBe(true);
      }
      for (const field of table.neverSent) {
        expect(names.has(field.name)).toBe(false);
      }
    }
  });
});
