// @vitest-environment node
// Validates the sync contract's conformance fixtures: every file in
// sync-server/contract/fixtures/ matches fixture.schema.json, and every payload
// in a merge fixture matches tables.json for its table. Also checks that
// contract/VERSION agrees with the server's CONTRACT_VERSION constant.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION } from "../../../sync-server/src/version";

type Field = {
  name: string;
  type: string;
  nullable: boolean;
  enum?: string[];
};
type Table = { tbl: string; fields: Field[] };
type Payload = Record<string, unknown>;
type Envelope = {
  tbl: string;
  publicId: string;
  hlc: string;
  deleted: boolean;
  payload: Payload;
};
type LocalRow = {
  tbl: string;
  hlc: string | null;
  dirty: boolean;
  unsealed: boolean;
  payload: Payload;
  local?: Payload;
};
type MergeFixture = {
  kind: "merge";
  id: string;
  given: LocalRow[];
  editsInFlight?: Array<{ tbl: string; payload: Payload }>;
  response: { pull: Envelope[]; rejected: unknown[] };
  expect: { push: Envelope[]; rows: LocalRow[] };
};

const contractDir = fileURLToPath(
  new URL("../../../sync-server/contract/", import.meta.url),
);
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(`${contractDir}${path}`, "utf8"));

const schema = readJson("fixture.schema.json") as object;
const tables = new Map(
  (readJson("tables.json") as { tables: Table[] }).tables.map((table) => [
    table.tbl,
    table,
  ]),
);
const fixtureFiles = readdirSync(`${contractDir}fixtures`)
  .filter((name) => name.endsWith(".json"))
  .sort();

const formats: Record<string, RegExp> = {
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  timestamp: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  month: /^\d{4}-\d{2}$/,
};

const payloadProblems = (tbl: string, payload: Payload): string[] => {
  const table = tables.get(tbl);
  if (!table) return [`unknown table ${tbl}`];
  const problems: string[] = [];
  const names = table.fields.map((field) => field.name);
  for (const key of Object.keys(payload)) {
    if (!names.includes(key)) problems.push(`${tbl}.${key} is not a field`);
  }
  for (const field of table.fields) {
    const where = `${tbl}.${field.name}`;
    if (!(field.name in payload)) {
      problems.push(`${where} is missing`);
      continue;
    }
    const value = payload[field.name];
    if (value === null) {
      if (!field.nullable) problems.push(`${where} must not be null`);
      continue;
    }
    const pattern = formats[field.type];
    const ok =
      pattern !== undefined
        ? typeof value === "string" && pattern.test(value)
        : field.type === "string"
          ? typeof value === "string"
          : field.type === "number"
            ? typeof value === "number" && Number.isFinite(value)
            : field.type === "integer"
              ? Number.isInteger(value)
              : field.type === "boolean" && typeof value === "boolean";
    if (!ok) problems.push(`${where} is not a valid ${field.type}`);
    if (field.enum && !field.enum.includes(value as string)) {
      problems.push(`${where} is not one of ${field.enum.join(", ")}`);
    }
  }
  return problems;
};

const deletedProblems = (where: string, deleted: boolean, payload: Payload) => {
  const problems: string[] = [];
  if ((payload.deletedAt !== null) !== deleted) {
    problems.push(`${where}: deletedAt does not match the deleted state`);
  }
  if ("deleted" in payload && payload.deleted !== deleted) {
    problems.push(`${where}: legacy deleted flag does not match`);
  }
  return problems;
};

const mergeProblems = (fixture: MergeFixture): string[] => {
  const problems: string[] = [];
  const rows = [...fixture.given, ...fixture.expect.rows];
  const envelopes = [...fixture.response.pull, ...fixture.expect.push];
  for (const row of rows) {
    problems.push(...payloadProblems(row.tbl, row.payload));
    if (row.unsealed && !row.dirty) {
      problems.push(`${row.tbl} ${row.payload.publicId}: unsealed but clean`);
    }
    if (row.local && row.tbl !== "accounts") {
      problems.push(`${row.tbl}: only accounts have local fields`);
    }
    problems.push(
      ...deletedProblems(
        `${row.tbl} ${String(row.payload.publicId)}`,
        row.payload.deletedAt !== null,
        row.payload,
      ),
    );
  }
  for (const edit of fixture.editsInFlight ?? []) {
    problems.push(...payloadProblems(edit.tbl, edit.payload));
  }
  for (const envelope of envelopes) {
    const where = `${envelope.tbl} ${envelope.publicId}`;
    problems.push(...payloadProblems(envelope.tbl, envelope.payload));
    if (envelope.payload.publicId !== envelope.publicId) {
      problems.push(`${where}: payload publicId differs from envelope`);
    }
    problems.push(
      ...deletedProblems(where, envelope.deleted, envelope.payload),
    );
  }
  const keys = (list: Array<{ tbl: string; payload: Payload }>) =>
    list.map((row) => `${row.tbl}/${String(row.payload.publicId)}`);
  for (const [name, list] of [
    ["given", fixture.given],
    ["expect.rows", fixture.expect.rows],
    ["expect.push", fixture.expect.push],
  ] as const) {
    const all = keys(list);
    if (new Set(all).size !== all.length) {
      problems.push(`${name} has a duplicate (tbl, publicId)`);
    }
  }
  return problems;
};

describe("sync contract fixtures", () => {
  const validate = new Ajv({ allErrors: true }).compile(schema);

  it("has the first SY-007 fixtures", () => {
    expect(fixtureFiles).toEqual(
      expect.arrayContaining([
        "remote-newer-wins.json",
        "remote-older-ignored.json",
        "equal-hlc-ignored.json",
        "remote-delete.json",
        "remote-undelete-beats-older-delete.json",
        "local-dirty-sealed-and-pushed.json",
      ]),
    );
  });

  it.each(fixtureFiles)("%s matches the schema and tables.json", (file) => {
    const fixture = readJson(`fixtures/${file}`) as MergeFixture;
    const valid = validate(fixture);
    expect(validate.errors ?? [], file).toEqual([]);
    expect(valid).toBe(true);
    if (fixture.kind === "merge") {
      expect(fixture.id).toBe(file.replace(/\.json$/, ""));
      expect(mergeProblems(fixture)).toEqual([]);
    }
  });

  it("rejects a fixture that breaks the schema", () => {
    const fixture = readJson(
      "fixtures/remote-newer-wins.json",
    ) as MergeFixture & { device: { deviceId: string } };
    fixture.device.deviceId = "not-a-uuid";
    expect(validate(fixture)).toBe(false);
  });

  it("finds payloads that drift from tables.json", () => {
    const fixture = readJson("fixtures/remote-newer-wins.json") as MergeFixture;
    const payload = fixture.given[0]?.payload;
    if (!payload) throw new Error("fixture has no rows");
    delete payload.currency;
    payload.colour = "red";
    expect(mergeProblems(fixture)).toEqual([
      "accounts.colour is not a field",
      "accounts.currency is missing",
    ]);
  });
});

describe("contract version", () => {
  it("matches the server's CONTRACT_VERSION", () => {
    const version = readFileSync(`${contractDir}VERSION`, "utf8");
    expect(version).toMatch(/^[1-9][0-9]*\n$/);
    expect(version.trim()).toBe(CONTRACT_VERSION);
  });
});
