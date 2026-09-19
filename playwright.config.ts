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
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "bun run vite preview --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !isCI,
  },
});
