import { defineConfig } from "vite";
import { resolve } from "node:path";

// The service worker. manifest.json declares `"type": "module"` for
// it, so (unlike the content scripts) it can be loaded as a real ES
// module — no IIFE needed.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/background/index.ts"),
      output: {
        entryFileNames: "background.js",
        format: "es",
      },
    },
  },
});
