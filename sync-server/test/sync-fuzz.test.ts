import { describe, expect, it } from "vitest";
import { rawPushPayloads } from "../src/json-ranges";
import { createTestServer } from "./helpers";
import { env, hlc, id, T0 } from "./sync-helpers";

const call = (
  s: Awaited<ReturnType<typeof createTestServer>>,
  token: string | undefined,
  rawBody: string,
) => s.call("POST", "/v1/sync", { token, rawBody });

describe("malformed push bodies", () => {
  it("answers each shape error with 400 bad_request (not a hang or a 500), with or without a token", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const good = env("payees", 1, hlc(T0));
    const { payload: _p, ...noPayload } = good;
    void _p;
    const bodies = [
      `{"formatVersion":1,"cursor":"0","push":[1]}`,
      `{"formatVersion":1,"cursor":"0","push":["x"]}`,
      `{"formatVersion":1,"cursor":"0","push":[null]}`,
      `{"formatVersion":1,"cursor":"0","push":[[]]}`,
      JSON.stringify({ formatVersion: 1, cursor: "0", push: [noPayload] }),
      JSON.stringify({
        formatVersion: 1,
        cursor: "0",
        push: [{ ...good, payload: "str" }],
      }),
    ];
    for (const token of [undefined, a.token]) {
      for (const body of bodies) {
        const res = await call(s, token, body);
        expect(res.status, body).toBe(400);
        expect(res.body.error).toBe("bad_request");
      }
    }
  });

  it("rejects excessive payload nesting with bad_request", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    for (const depth of [40, 5000, 200_000]) {
      const payload = `${"[".repeat(depth)}${"]".repeat(depth)}`;
      const body = `{"formatVersion":1,"cursor":"0","push":[{"tbl":"payees","publicId":"${id(1)}","hlc":"${hlc(T0)}","deleted":false,"payload":{"x":${payload}}}]}`;
      const res = await call(s, a.token, body);
      expect(res.status, `depth ${depth}`).toBe(400);
    }
    // a normal nesting depth is still fine
    const ok = await call(
      s,
      a.token,
      JSON.stringify({
        formatVersion: 1,
        cursor: "0",
        push: [
          env("payees", 2, hlc(T0), { payload: { a: { b: { c: [1, [2]] } } } }),
        ],
      }),
    );
    expect(ok.status).toBe(200);
  });

  it("does the raw payload scan only after authentication", async () => {
    const s = await createTestServer();
    // A body whose payload scan would be rejected (deep nesting) but with a bad
    // token: the answer is bad_token, so the scan (and the stringify) never ran.
    const payload = `${"[".repeat(1000)}${"]".repeat(1000)}`;
    const body = `{"formatVersion":1,"cursor":"0","push":[{"tbl":"payees","publicId":"${id(1)}","hlc":"${hlc(T0)}","deleted":false,"payload":{"x":${payload}}}]}`;
    const res = await call(s, "nosuchtoken", body);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("bad_token");
  });

  it("scanner loops are bounded on any input", () => {
    for (const text of [
      `{"push":[1]`,
      `{"push":["x`,
      `{"push":[{"payload":"\\`,
      `{"push":[{"payload":{"a":`,
      `[`,
      `{`,
      ``,
      `{"push":[{"payload":tru`,
    ]) {
      // Must return or throw, never loop.
      try {
        rawPushPayloads(text);
      } catch {
        /* fine */
      }
    }
  });

  it("fuzz: random truncations and mutations of valid bodies never hang or 500", async () => {
    const s = await createTestServer();
    const a = await s.enrolDevice("alice");
    const valid = JSON.stringify({
      formatVersion: 1,
      cursor: "0",
      push: [
        env("payees", 1, hlc(T0), {
          payload: { name: 'café "q"', n: [1, 2.5, { z: null }] },
        }),
        env("accounts", 2, hlc(T0), { deleted: true }),
      ],
    });
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };
    const junk = [
      '"',
      "\\",
      "{",
      "}",
      "[",
      "]",
      ",",
      ":",
      " ",
      "1",
      "e",
      "-",
      "\n",
      "\u0000",
      "é",
    ];
    for (let i = 0; i < 400; i++) {
      let body = valid;
      const kind = rnd(3);
      if (kind === 0) body = body.slice(0, rnd(body.length + 1));
      else if (kind === 1) {
        const at = rnd(body.length);
        body = body.slice(0, at) + junk[rnd(junk.length)] + body.slice(at + 1);
      } else {
        const at = rnd(body.length);
        body = body.slice(0, at) + junk[rnd(junk.length)] + body.slice(at);
        body = body.slice(0, rnd(body.length + 1));
      }
      const res = await call(s, rnd(4) === 0 ? undefined : a.token, body);
      expect(res.status, body).toBeLessThan(500);
    }
  });
});
