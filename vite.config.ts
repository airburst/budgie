import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
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
    rollupOptions: {
      external: ["electron", "electron-settings"],
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
