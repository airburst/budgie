import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(
  (
    globalThis as typeof globalThis & {
      process?: { env?: { CI?: string } };
    }
  ).process?.env?.CI,
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? "line" : "list",
  projects: [
    {
      name: "chromium",
      testIgnore: /sync-origin\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:4173", ...devices["Desktop Chrome"] },
    },
    {
      // SY-036: a second build with a sync URL pointing at a local stub that
      // e2e/sync-origin.spec.ts starts itself (port 4599).
      name: "sync-origin",
      testMatch: /sync-origin\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:4174", ...devices["Desktop Chrome"] },
    },
  ],
  use: { trace: "retain-on-failure" },
  webServer: [
    {
      command: "bun run vite preview --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !isCI,
    },
    {
      command:
        "VITE_SYNC_SERVER_URL=http://127.0.0.1:4599 BUDGIE_OUT_DIR=build-sync sh -c 'bun run vite build --config vite.config.ts && bun run vite preview --host 127.0.0.1 --port 4174'",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],
});
