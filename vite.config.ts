import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
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
    sourcemap: false,
    rollupOptions: {
      external: ["electron", "electron-settings"],
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-recharts": ["recharts"],
          "vendor-rrule": ["rrule"],
          "vendor-dates": ["date-fns", "react-day-picker"],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
