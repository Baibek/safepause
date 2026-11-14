import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vite build --mode virtual` produces the serverless bundle (API runs in the browser).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: "./",
  server: { proxy: { "/api": "http://localhost:8000" }, fs: { allow: [".."] } },
  build: mode === "virtual"
    ? { outDir: "dist-virtual", chunkSizeWarningLimit: 2000,
        rollupOptions: { output: { entryFileNames: "app.js", assetFileNames: "app[extname]", inlineDynamicImports: true } } }
    : { chunkSizeWarningLimit: 2000 },
}));
