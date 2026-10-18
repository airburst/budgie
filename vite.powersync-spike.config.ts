import { defineConfig } from "vite";

export default defineConfig({
  root: "spikes/powersync",
  base: "./",
  server: {
    port: 4174,
    strictPort: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    outDir: "../../build-powersync-spike",
    emptyOutDir: true,
  },
});
