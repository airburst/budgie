import { T0, type TestServer } from "./helpers";

export const DEV_A = "3c9a1e52-7d4b-4f0e-9b6a-2e8d5c1f0a47";

export function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function hlc(wall: number, counter = 0, device = DEV_A): string {
  return `${String(wall).padStart(15, "0")}:${String(counter).padStart(5, "0")}:${device}`;
}

export function env(
  tbl: string,
  n: number,
  h: string,
  opts: { deleted?: boolean; payload?: Record<string, unknown> } = {},
) {
  return {
    tbl,
    publicId: id(n),
    hlc: h,
    deleted: opts.deleted ?? false,
    payload: opts.payload ?? { publicId: id(n), name: `row ${n}` },
  };
}

export function sync(
  s: TestServer,
  token: string,
  push: unknown[] = [],
  cursor = "0",
  formatVersion = 1,
) {
  return s.call("POST", "/v1/sync", {
    token,
    body: { formatVersion, cursor, push },
  });
}

export { T0 };
