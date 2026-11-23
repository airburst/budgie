// @vitest-environment node
// The engine's payload rules: field list drift against tables.json, pulled
// envelope validation (SPEC.md 8.7), delete normalisation (5.5) and push
// chunking (10.2).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PORTABLE_TABLES } from "@/services/portable-data";
import { EnvelopeTooLargeError } from "@/services/sync/errors";
import {
  envelopeProblem,
  normaliseIncomingPayload,
  SYNC_PAYLOAD_FIELDS,
  toOutgoingEnvelope,
  type SyncEnvelope,
} from "@/services/sync/payload";
import { chunkPush } from "@/services/sync/push";
import { describe, expect, it } from "vitest";

const contract = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../sync-server/contract/tables.json", import.meta.url),
    ),
    "utf8",
  ),
) as {
  tables: Array<{
    tbl: string;
    applyOrder: number;
    fields: Array<{
      name: string;
      type: string;
      nullable: boolean;
      enum?: string[];
    }>;
  }>;
};

const HLC = "001795342530000:00000:9d2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50";
const ID = "0b8e5d7c-1a2b-4c3d-9e8f-7a6b5c4d3e2f";

const account = (overrides: Record<string, unknown> = {}) => ({
  publicId: ID,
  createdAt: "2026-11-01 08:00:00",
  updatedAt: "2026-11-22 10:15:30",
  deletedAt: null,
  name: "Current account",
  number: null,
  type: "bank",
  balance: 1500,
  currency: "GBP",
  notes: null,
  interestRate: null,
  creditLimit: null,
  deleted: false,
  ...overrides,
});

const envelope = (
  overrides: Partial<SyncEnvelope> = {},
  payload: Record<string, unknown> = {},
): SyncEnvelope => ({
  tbl: "accounts",
  publicId: ID,
  hlc: HLC,
  deleted: false,
  payload: account(payload),
  ...overrides,
});

describe("sync payload fields", () => {
  it("match tables.json for every table, in apply order", () => {
    const ordered = [...contract.tables].sort(
      (a, b) => a.applyOrder - b.applyOrder,
    );
    expect(ordered.map((t) => t.tbl)).toEqual([...PORTABLE_TABLES]);
    for (const table of ordered) {
      expect(
        SYNC_PAYLOAD_FIELDS[table.tbl as (typeof PORTABLE_TABLES)[number]],
        table.tbl,
      ).toEqual(
        table.fields.map(({ name, type, nullable, enum: values }) => ({
          name,
          type,
          nullable,
          ...(values ? { enum: values } : {}),
        })),
      );
    }
  });
});

describe("pulled envelope validation", () => {
  it("accepts a valid envelope with unknown payload fields", () => {
    expect(envelopeProblem(envelope({}, { bankText: "x" }))).toBeNull();
  });

  it.each([
    ["unknown tbl", { tbl: "nope" as never }, {}],
    ["bad hlc", { hlc: "1:2:3" }, {}],
    ["non-uuid public id", { publicId: "legacy:accounts:1" }, {}],
    ["missing field", {}, { currency: undefined }],
    ["wrong type", {}, { balance: "1500" }],
    ["outside enum", {}, { type: "piggy_bank" }],
    ["null in a non-null field", {}, { name: null }],
    ["bad timestamp", {}, { updatedAt: "2026-11-22T10:15:30Z" }],
  ])("rejects %s", (_, overrides, payload) => {
    const value = envelope(overrides, payload) as unknown as Record<
      string,
      unknown
    >;
    const fields = value.payload as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
      if (fields[key] === undefined) delete fields[key];
    }
    expect(envelopeProblem(value)).not.toBeNull();
  });
});

describe("delete normalisation", () => {
  it("fills deletedAt from the HLC wall time and sets the legacy flag", () => {
    expect(
      normaliseIncomingPayload(envelope({ deleted: true }, { deleted: false })),
    ).toMatchObject({ deletedAt: "2026-11-22 10:15:30", deleted: true });
  });

  it("clears deletedAt and the flag for a live envelope", () => {
    expect(
      normaliseIncomingPayload(
        envelope({}, { deletedAt: "2026-11-22 10:00:00", deleted: true }),
      ),
    ).toMatchObject({ deletedAt: null, deleted: false });
  });

  it("sends a flag-only delete as deleted with a deletedAt", () => {
    const out = toOutgoingEnvelope(
      "accounts",
      HLC,
      account({ deleted: true }) as never,
    );
    expect(out.deleted).toBe(true);
    expect(out.payload).toMatchObject({
      deleted: true,
      deletedAt: "2026-11-22 10:15:30",
    });
  });
});

describe("push chunking", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => [
      envelope({ publicId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }),
    ]);

  it("caps chunks by envelope count", () => {
    expect(chunkPush(many(1201)).map((c) => c.length)).toEqual([500, 500, 201]);
  });

  it("caps chunks by bytes and keeps order", () => {
    const units = many(10);
    const size = new TextEncoder().encode(JSON.stringify(units[0]?.[0])).length;
    const chunks = chunkPush(units, {
      maxEnvelopes: 500,
      maxBytes: 512 + (size + 1) * 3,
    });
    expect(chunks.map((c) => c.length)).toEqual([3, 3, 3, 1]);
    expect(chunks.flat()).toEqual(units.flat());
  });

  it("refuses an envelope that can never fit", () => {
    expect(() =>
      chunkPush(many(1), { maxEnvelopes: 500, maxBytes: 600 }),
    ).toThrow(EnvelopeTooLargeError);
  });
});
