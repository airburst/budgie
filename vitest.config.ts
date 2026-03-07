import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Unit tests: extends vite.config which has React plugin, tailwind, and @ alias
        extends: "./vite.config.ts",
        test: {
          name: "unit",
          environment: "happy-dom",
          globals: false,
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/tests/integration/**", "**/node_modules/**"],
          setupFiles: ["src/setupTests.ts"],
        },
      },
      {
        // Integration tests: node env, paths relative to project root
        resolve: {
          alias: {
            "@": new URL("./src", import.meta.url).pathname,
          },
        },
        test: {
          name: "integration",
          environment: "node",
          globals: false,
          include: ["src/tests/integration/**/*.test.ts"],
          setupFiles: ["src/tests/integration/setup.ts"],
        },
      },
    ],
  },
});
