import { builtinModules } from "node:module";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: "src/services/index.ts",
      formats: ["cjs"],
      fileName: () => "services.js",
    },
    outDir: "public",
    emptyOutDir: false,
    rollupOptions: {
      external: (id) =>
        builtinModules.includes(id) ||
        builtinModules.includes(id.replace("node:", "")),
    },
  },
});
