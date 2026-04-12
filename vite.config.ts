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
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router")
          )
            return "vendor-react";
          if (id.includes("/@tanstack/react-query")) return "vendor-query";
          if (id.includes("/recharts")) return "vendor-recharts";
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
  },
});
