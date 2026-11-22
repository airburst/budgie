// @vitest-environment node
// Runs every vector in sync-server/contract/fixtures/ids.json against the
// deterministic auto-post id function (SPEC.md section 8.9).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type AutoPostLeg,
  autoPostIdInput,
  autoPostTransactionId,
} from "@/services/sync/ids";

type Vector = {
  schedulePublicId: string;
  dueDate: string;
  leg: AutoPostLeg;
  input: string;
  sha256: string;
  id: string;
};

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        "../../../sync-server/contract/fixtures/ids.json",
        import.meta.url,
      ),
    ),
    "utf8",
  ),
) as {
  vectors: Vector[];
  invalid: Array<{ schedulePublicId: string; dueDate: string; leg: string }>;
};

const UUID_V8 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("autoPostTransactionId", () => {
  it("has at least 10 vectors", () => {
    expect(fixture.vectors.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixture.vectors.map((vector) => [vector.input, vector] as const))(
    "%s",
    async (_input, vector) => {
      const input = autoPostIdInput(
        vector.schedulePublicId,
        vector.dueDate,
        vector.leg,
      );
      expect(input).toBe(vector.input);
      expect(createHash("sha256").update(input, "utf8").digest("hex")).toBe(
        vector.sha256,
      );
      const id = await autoPostTransactionId(
        vector.schedulePublicId,
        vector.dueDate,
        vector.leg,
      );
      expect(id).toBe(vector.id);
      expect(id).toMatch(UUID_V8);
    },
  );

  it("gives the two legs of a transfer different ids", async () => {
    const pairs = fixture.vectors.filter((vector) => vector.leg === "transfer");
    expect(pairs.length).toBeGreaterThan(0);
    for (const vector of pairs) {
      const account = await autoPostTransactionId(
        vector.schedulePublicId,
        vector.dueDate,
        "account",
      );
      expect(account).not.toBe(vector.id);
    }
  });

  it("is stable and differs by date and schedule", async () => {
    const schedule = "2f6d8c1a-4b3e-4d5f-9a7b-8c9d0e1f2a3b";
    const first = await autoPostTransactionId(
      schedule,
      "2026-11-22",
      "account",
    );
    expect(await autoPostTransactionId(schedule, "2026-11-22", "account")).toBe(
      first,
    );
    expect(
      await autoPostTransactionId(schedule, "2026-11-23", "account"),
    ).not.toBe(first);
    expect(
      await autoPostTransactionId(
        "e3b0c442-98fc-4c14-9afb-f4c8996fb924",
        "2026-11-22",
        "account",
      ),
    ).not.toBe(first);
  });

  it.each(fixture.invalid.map((vector) => [vector] as const))(
    "refuses %o",
    async (vector) => {
      await expect(
        autoPostTransactionId(
          vector.schedulePublicId,
          vector.dueDate,
          vector.leg as AutoPostLeg,
        ),
      ).rejects.toThrow(/Auto-post id/);
    },
  );
});
