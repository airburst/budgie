import type { BrowserDatabase } from "@/web/db/browser-database";
import {
  initializeWebRuntime,
  type WebRuntimeDependencies,
} from "@/web/runtime/runtime";
import { describe, expect, it, vi } from "vitest";

const createDatabase = () => {
  const database = {
    ready: Promise.resolve({
      id: 1,
      type: "ready" as const,
      sqliteVersion: "test",
      applied: [],
      skipped: [],
    }),
    close: vi.fn(async () => undefined),
  } as unknown as BrowserDatabase;
  return database;
};

const createDependencies = (database: BrowserDatabase) => {
  const release = vi.fn();
  const processAutoPost = vi.fn(async () => undefined);
  const dependencies: WebRuntimeDependencies = {
    acquireLock: vi.fn(async () => ({ active: true, release })),
    createDatabase: vi.fn(() => database),
    requestPersistence: vi.fn(async () => "denied" as const),
    processAutoPost,
  };
  return { dependencies, processAutoPost, release };
};

describe("web runtime", () => {
  it("initializes, resumes auto-posting, and shuts down cleanly", async () => {
    const database = createDatabase();
    const { dependencies, processAutoPost, release } =
      createDependencies(database);

    const runtime = await initializeWebRuntime("test.sqlite3", dependencies);
    expect(runtime?.persistence).toBe("denied");
    expect(processAutoPost).toHaveBeenCalledTimes(1);

    await runtime?.resume();
    expect(processAutoPost).toHaveBeenCalledTimes(2);

    await runtime?.shutdown();
    expect(database.close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the active lock when database startup fails", async () => {
    const database = createDatabase();
    database.ready = Promise.reject(new Error("migration failed"));
    const { dependencies, release } = createDependencies(database);

    await expect(
      initializeWebRuntime("test.sqlite3", dependencies),
    ).rejects.toThrow("migration failed");
    expect(database.close).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not initialize a database for an inactive instance", async () => {
    const database = createDatabase();
    const { dependencies } = createDependencies(database);
    dependencies.acquireLock = vi.fn(async () => ({
      active: false,
      release: vi.fn(),
    }));

    await expect(
      initializeWebRuntime("test.sqlite3", dependencies),
    ).resolves.toBeNull();
    expect(dependencies.createDatabase).not.toHaveBeenCalled();
  });
});
