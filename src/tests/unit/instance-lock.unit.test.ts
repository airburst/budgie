import { acquireInstanceLock } from "@/web/runtime/instance-lock";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  Reflect.deleteProperty(navigator, "locks");
});

describe("browser instance lock", () => {
  it("allows the runtime fallback when Web Locks are unavailable", async () => {
    const lock = await acquireInstanceLock("test-instance-lock");
    expect(lock.active).toBe(true);
    lock.release();
  });

  it("returns after acquiring a Web Lock while holding it until release", async () => {
    const request = vi.fn(
      async (
        _name: string,
        _options: { ifAvailable: boolean },
        callback: (held: object) => Promise<boolean>,
      ) => {
        await callback({});
      },
    );
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });

    const lock = await acquireInstanceLock("test-web-lock");
    expect(lock.active).toBe(true);
    const release = lock.release;
    release();
    expect(request).toHaveBeenCalledOnce();
  });
});
