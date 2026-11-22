// Shapes below are what wrangler 4.166 prints with `d1 execute --json`
// (read from sync-server/node_modules/wrangler/wrangler-dist/cli.js, `executeSql`
// and `executeLocally` / `executeRemotely`). The remote path cannot be run here.
import { describe, expect, it } from "vitest";
import {
  buildWranglerArgs,
  parseWranglerOutput,
} from "../scripts/wrangler-executor";

// executeLocally, for both --file and --command: one entry per statement,
// meta holds only the duration (no `changes`).
const LOCAL = JSON.stringify(
  [
    { results: [], success: true, meta: { duration: 0 } },
    { results: [{ id: "u1" }], success: true, meta: { duration: 1 } },
  ],
  null,
  2,
);

// executeRemotely with --command: the D1 REST /query result, one entry per
// statement, meta carries `changes`.
const REMOTE_COMMAND = JSON.stringify(
  [
    {
      results: [],
      success: true,
      meta: {
        served_by: "v3-prod",
        duration: 0.2,
        changes: 1,
        last_row_id: 0,
        changed_db: true,
        size_after: 8192,
        rows_read: 1,
        rows_written: 2,
      },
    },
    {
      results: [{ id: "u1" }],
      success: true,
      meta: { duration: 0.1, changes: 0, rows_read: 1, rows_written: 0 },
    },
  ],
  null,
  2,
);

// executeRemotely with --file: the import API, ONE summary entry whatever the
// number of statements. This is why remote runs must not use --file.
const REMOTE_FILE = JSON.stringify([
  {
    results: [
      {
        "Total queries executed": 2,
        "Rows read": 1,
        "Rows written": 2,
        "Database size (MB)": "0.01",
      },
    ],
    success: true,
    finalBookmark: "00000001-00000002-00004e2f",
    meta: { duration: 3 },
  },
]);

describe("parseWranglerOutput", () => {
  it("reads local output: one result per statement, no changes", () => {
    const r = parseWranglerOutput(LOCAL, 2);
    expect(r).toEqual([
      { rows: [], changes: 0 },
      { rows: [{ id: "u1" }], changes: 0 },
    ]);
  });

  it("reads remote --command output including meta.changes", () => {
    const r = parseWranglerOutput(REMOTE_COMMAND, 2);
    expect(r).toEqual([
      { rows: [], changes: 1 },
      { rows: [{ id: "u1" }], changes: 0 },
    ]);
  });

  it("refuses the remote --file summary shape (one entry for two statements)", () => {
    expect(() => parseWranglerOutput(REMOTE_FILE, 2)).toThrow(
      /1 result.*2 statements/i,
    );
  });

  it("accepts a single object for a single statement", () => {
    const one = JSON.stringify({
      results: [{ a: 1 }],
      success: true,
      meta: {},
    });
    expect(parseWranglerOutput(one, 1)).toEqual([
      { rows: [{ a: 1 }], changes: 0 },
    ]);
  });

  it("skips log lines before the JSON", () => {
    expect(parseWranglerOutput(`some banner\n${LOCAL}`, 2)).toHaveLength(2);
  });

  it("rejects failed statements and non-JSON output", () => {
    const failed = JSON.stringify([{ results: [], success: false, meta: {} }]);
    expect(() => parseWranglerOutput(failed, 1)).toThrow(/failed/);
    expect(() => parseWranglerOutput("nope", 1)).toThrow(/JSON/);
  });
});

describe("buildWranglerArgs", () => {
  const target = {
    mode: "remote",
    database: "budgie-sync",
    config: "wrangler.jsonc",
  } as const;

  it("runs every mode with --command, never --file", () => {
    for (const mode of ["local", "remote"] as const) {
      const args = buildWranglerArgs({ ...target, mode }, "SELECT 1; SELECT 2");
      expect(args).toContain("--command");
      expect(args).not.toContain("--file");
      expect(args).toContain(`--${mode}`);
      expect(args).toContain("--json");
    }
  });
});
