import { acquireInstanceLock } from "@/web/runtime/instance-lock";
import { describe, expect, it } from "vitest";

describe("browser instance lock", () => {
  it("allows the runtime fallback when Web Locks are unavailable", async () => {
    const lock = await acquireInstanceLock("test-instance-lock");
    expect(lock.active).toBe(true);
    lock.release();
  });
});
