import { readFileSync } from "node:fs";
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
      {
        // Sync server (Cloudflare Worker): handlers run on in-memory better-sqlite3.
        // The Worker bundle imports .sql files as text (wrangler "rules"); do the same here.
        plugins: [
          {
            name: "sql-as-text",
            enforce: "pre",
            load(id) {
              if (id.endsWith(".sql")) {
                return `export default ${JSON.stringify(readFileSync(id, "utf8"))}`;
              }
            },
          },
        ],
        test: {
          name: "sync-server",
          environment: "node",
          globals: false,
          include: ["sync-server/test/**/*.test.ts"],
        },
      },
    ],
  },
});
