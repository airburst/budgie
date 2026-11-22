import { describe, expect, it } from "vitest";
import {
  HLC_PATTERN,
  compareHlc,
  encodeHlc,
  parseHlc,
  sealHlc,
  sealHlcFromUpdatedAt,
  updatedAtToMs,
} from "@/services/sync/hlc";

const A = "3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47";
const B = "9d2f4b61-0c3e-4a5d-8f7a-6b1c2d3e4f50";

describe("encode / parse", () => {
  it("encodes the spec example", () => {
    const s = encodeHlc({ wall: 1795342530000, counter: 0, deviceId: A });
    expect(s).toBe(`001795342530000:00000:${A}`);
    expect(s).toHaveLength(58);
    expect(HLC_PATTERN.test(s)).toBe(true);
  });

  it("round-trips", () => {
    const h = { wall: 1795342530123, counter: 42, deviceId: B };
    expect(parseHlc(encodeHlc(h))).toEqual(h);
  });

  it("rejects out-of-range parts when encoding", () => {
    expect(() => encodeHlc({ wall: -1, counter: 0, deviceId: A })).toThrow();
    expect(() => encodeHlc({ wall: 1.5, counter: 0, deviceId: A })).toThrow();
    expect(() => encodeHlc({ wall: 1e15, counter: 0, deviceId: A })).toThrow();
    expect(() =>
      encodeHlc({ wall: 1, counter: 100000, deviceId: A }),
    ).toThrow();
    expect(() => encodeHlc({ wall: 1, counter: -1, deviceId: A })).toThrow();
    expect(() =>
      encodeHlc({ wall: 1, counter: 0, deviceId: A.toUpperCase() }),
    ).toThrow();
  });

  it.each([
    "",
    "nonsense",
    `1795342530000:00000:${A}`,
    `0001795342530000:00000:${A}`,
    `001795342530000:0000:${A}`,
    `001795342530000:000000:${A}`,
    `001795342530000:00000:${A.toUpperCase()}`,
    `001795342530000:00000:${A.replace(/-/g, "")}`,
    `001795342530000:00000:${A}\n`,
    ` 001795342530000:00000:${A}`,
    `00179534253000x:00000:${A}`,
    `001795342530000:00000:${A}:x`,
  ])("rejects %j", (s) => {
    expect(parseHlc(s)).toBeNull();
  });
});

describe("compare", () => {
  it("treats a missing HLC as older than any HLC", () => {
    const h = encodeHlc({ wall: 0, counter: 0, deviceId: A });
    expect(compareHlc(null, h)).toBe(-1);
    expect(compareHlc(undefined, h)).toBe(-1);
    expect(compareHlc(h, null)).toBe(1);
    expect(compareHlc(null, undefined)).toBe(0);
  });

  it("orders by wall, then counter, then device id", () => {
    const e = (wall: number, counter: number, deviceId: string) =>
      encodeHlc({ wall, counter, deviceId });
    expect(compareHlc(e(1, 99999, B), e(2, 0, A))).toBe(-1);
    expect(compareHlc(e(5, 1, B), e(5, 2, A))).toBe(-1);
    expect(compareHlc(e(5, 2, A), e(5, 2, B))).toBe(-1);
    expect(compareHlc(e(5, 2, A), e(5, 2, A))).toBe(0);
  });

  it("string order agrees with tuple order over random values", () => {
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const hex = (n: number) =>
      Array.from(
        { length: n },
        () => "0123456789abcdef"[Math.floor(rnd() * 16)],
      ).join("");
    const uuid = () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
    const devices = [uuid(), uuid(), uuid()];
    const gen = () => ({
      // Small ranges force frequent ties on earlier tuple parts.
      wall: Math.floor(rnd() * 3) * 1e12 + Math.floor(rnd() * 3),
      counter: [0, 1, 9, 10, 99999][Math.floor(rnd() * 5)],
      deviceId: devices[Math.floor(rnd() * 3)],
    });
    for (let i = 0; i < 5000; i++) {
      const x = gen();
      const y = gen();
      let tuple: number;
      if (x.wall !== y.wall) tuple = Math.sign(x.wall - y.wall);
      else if (x.counter !== y.counter)
        tuple = Math.sign(x.counter - y.counter);
      else if (x.deviceId < y.deviceId) tuple = -1;
      else if (x.deviceId > y.deviceId) tuple = 1;
      else tuple = 0;
      expect(compareHlc(encodeHlc(x), encodeHlc(y))).toBe(tuple);
    }
  });
});

describe("updatedAtToMs", () => {
  it("parses UTC text", () => {
    expect(updatedAtToMs("2026-11-22 10:15:30")).toBe(1795342530000);
  });
  it("returns null for null or malformed text", () => {
    expect(updatedAtToMs(null)).toBeNull();
    expect(updatedAtToMs(undefined)).toBeNull();
    expect(updatedAtToMs("")).toBeNull();
    expect(updatedAtToMs("2026-11-22T10:15:30Z")).toBeNull();
    expect(updatedAtToMs("2026-02-31 10:15:30")).toBeNull();
  });
});

describe("seal rule: spec section 7.3 example table", () => {
  const h = (wall: number, counter: number, d: string) =>
    encodeHlc({ wall, counter, deviceId: d });
  const rows: [string, string | null, string, string][] = [
    ["from edit", null, "2026-11-22 10:15:30", h(1795342530000, 0, A)],
    [
      "same second: increment",
      h(1795342530000, 0, A),
      "2026-11-22 10:15:30",
      h(1795342530000, 1, A),
    ],
    [
      "B's clock was ahead",
      h(1795342800000, 3, B),
      "2026-11-22 10:16:00",
      h(1795342800000, 4, A),
    ],
    [
      "from edit (later than current)",
      h(1795342500000, 2, B),
      "2026-11-22 10:20:00",
      h(1795342800000, 0, A),
    ],
    [
      "counter full",
      h(1795342530000, 99999, A),
      "2026-11-22 10:15:30",
      h(1795342530001, 0, A),
    ],
  ];
  it.each(rows)("%s", (_why, current, updatedAt, expected) => {
    const ms = updatedAtToMs(updatedAt)!;
    expect(sealHlc(current, A, ms)).toBe(expected);
    expect(sealHlcFromUpdatedAt(current, A, updatedAt, 0)).toBe(expected);
  });
});

describe("seal rule: properties", () => {
  it("edit after a remote apply beats it even when this clock is behind", () => {
    const remote = encodeHlc({ wall: 1795342800000, counter: 7, deviceId: B });
    const sealed = sealHlc(remote, A, updatedAtToMs("2026-11-22 10:00:00")!);
    expect(compareHlc(sealed, remote)).toBe(1);
    const again = sealHlc(sealed, A, updatedAtToMs("2026-11-22 10:00:01")!);
    expect(compareHlc(again, sealed)).toBe(1);
  });

  it("ties in the same second: counter first, then device id", () => {
    const sameSecond = updatedAtToMs("2026-11-22 10:15:30")!;
    const a = sealHlc(null, A, sameSecond);
    const b = sealHlc(null, B, sameSecond);
    // Equal wall and counter: device id decides (A < B).
    expect(compareHlc(a, b)).toBe(-1);
    // A higher counter beats a higher device id.
    const aAgain = sealHlc(a, A, sameSecond);
    expect(compareHlc(aAgain, b)).toBe(1);
  });

  it("counter overflow rolls the wall forward by one ms", () => {
    const full = encodeHlc({ wall: 5000, counter: 99999, deviceId: B });
    expect(sealHlc(full, A, 0)).toBe(
      encodeHlc({ wall: 5001, counter: 0, deviceId: A }),
    );
  });

  it("is always strictly greater than the current HLC (random)", () => {
    for (let i = 0; i < 500; i++) {
      const cur = encodeHlc({
        wall: (i * 7919) % 100000,
        counter: i % 3 === 0 ? 99999 : i % 100,
        deviceId: i % 2 ? A : B,
      });
      const next = sealHlc(cur, A, (i * 104729) % 100000);
      expect(compareHlc(next, cur)).toBe(1);
      expect(parseHlc(next)).not.toBeNull();
    }
  });

  it("uses the supplied clock when updatedAt is null", () => {
    expect(sealHlcFromUpdatedAt(null, A, null, 1795342530123)).toBe(
      encodeHlc({ wall: 1795342530123, counter: 0, deviceId: A }),
    );
  });

  it("throws on a malformed current HLC", () => {
    expect(() => sealHlc("garbage", A, 1)).toThrow();
  });
});
