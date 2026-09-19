import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";
import pkg from "./package.json" with { type: "json" };

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const securityHeaders = {
  ...isolationHeaders,
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; form-action 'self'; upgrade-insecure-requests",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : Promise.resolve([path]);
    }),
  );
  return files.flat();
};

const webArtifactPlugin = (): Plugin => ({
  name: "budgie-web-artifact",
  async closeBundle() {
    const outputDirectory = new URL("./build/", import.meta.url).pathname;
    if (!outputDirectory) return;
    const files = await listFiles(outputDirectory);
    const precacheUrls = [
      "./",
      ...files
        .map(
          (file) =>
            `./${relative(outputDirectory, file).replaceAll("\\", "/")}`,
        )
        .filter((file) => file !== "./sw.js"),
    ];
    const serviceWorkerPath = join(outputDirectory, "sw.js");
    const source = await readFile("src/public/sw.js", "utf8");
    const generated = source
      .replace(
        'const version = new URL(self.location.href).searchParams.get("version") ?? "1";',
        `const version = ${JSON.stringify(pkg.version)};`,
      )
      .replace(
        'const PRECACHE_URLS = ["./"];',
        `const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};`,
      );
    await writeFile(serviceWorkerPath, generated);
  },
});

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [tailwindcss(), react(), webArtifactPlugin()],
  root: "src",
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  optimizeDeps: {
    exclude: ["electron", "electron-settings"],
  },
  base: "./",
  build: {
    outDir: "../build",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      external: ["electron", "electron-settings"],
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router")
          )
            return "vendor-react";
          if (id.includes("/@tanstack/react-query")) return "vendor-query";
          if (id.includes("/@tanstack/charts")) return "vendor-charts";
          if (id.includes("/rrule")) return "vendor-rrule";
          if (id.includes("/date-fns") || id.includes("/react-day-picker"))
            return "vendor-dates";
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    headers: {
      ...isolationHeaders,
      "Content-Security-Policy":
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws://localhost:* http://localhost:*; worker-src 'self' blob:; manifest-src 'self';",
    },
  },
  preview: {
    headers: securityHeaders,
  },
});
