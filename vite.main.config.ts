import { builtinModules } from "module";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "src/main/db/index.ts",
      formats: ["cjs"],
      fileName: () => "db.js",
    },
    outDir: "public",
    emptyOutDir: false,
    rollupOptions: {
      external: (id) =>
        id === "electron" ||
        id === "better-sqlite3" ||
        id.startsWith("drizzle-orm") ||
        builtinModules.includes(id) ||
        builtinModules.includes(id.replace("node:", "")),
    },
  },
});
