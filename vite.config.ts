import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/client"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/pdfjs-dist")) return "pdf-engine";
          if (id.includes("node_modules/katex")) return "math-engine";
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id))
            return "react";

          if (id.includes("node_modules/@radix-ui")) return "ui-primitives";
        },
      },
    },
  },
});
