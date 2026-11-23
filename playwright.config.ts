import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(
  (
    globalThis as typeof globalThis & {
      process?: { env?: { CI?: string } };
    }
  ).process?.env?.CI,
);

// SY-044: the real sync server (celld, scripts/e2e-sync-server.ts) and the
// build that talks to it. Separate ports from the sync-origin build and its
// stub (4174 / 4599), so the two sync projects can run side by side.
const REAL_SYNC_PORT = 4600;
const REAL_SYNC_APP = "http://127.0.0.1:4175";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? "line" : "list",
  projects: [
    {
      name: "chromium",
      testIgnore: /sync-(origin|ui|devices|notices|real)\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:4173", ...devices["Desktop Chrome"] },
    },
    {
      // SY-036: a second build with a sync URL pointing at a local stub that
      // e2e/sync-origin.spec.ts starts itself (port 4599). e2e/sync-ui.spec.ts
      // runs here too, with the sync server mocked by page.route.
      name: "sync-origin",
      testMatch: /sync-(origin|ui|devices|notices)\.spec\.ts/,
      use: { baseURL: "http://127.0.0.1:4174", ...devices["Desktop Chrome"] },
    },
    {
      // SY-044: a third build whose sync URL is the real server on celld, with
      // no mocks (e2e/sync-real.spec.ts).
      name: "sync-real",
      testMatch: /sync-real\.spec\.ts/,
      use: { baseURL: REAL_SYNC_APP, ...devices["Desktop Chrome"] },
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
    {
      command: `VITE_SYNC_SERVER_URL=http://127.0.0.1:${REAL_SYNC_PORT} BUDGIE_OUT_DIR=build-sync-real sh -c 'bun run vite build --config vite.config.ts && bun run vite preview --host 127.0.0.1 --port 4175'`,
      url: REAL_SYNC_APP,
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
    {
      // Never reused: every run gets an empty database, and a server already
      // on the port fails the run instead of testing stale state.
      command: `bun run scripts/e2e-sync-server.ts ${REAL_SYNC_PORT} ${REAL_SYNC_APP}`,
      url: `http://127.0.0.1:${REAL_SYNC_PORT}/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ],
});
