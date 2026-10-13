import { defineConfig } from "vite";
import { resolve } from "node:path";

// Content scripts can't be ES modules loaded via manifest.json, so this
// is built as a standalone IIFE into dist/content.js, run after the
// main config so it doesn't wipe the popup's output (emptyOutDir: false).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/content/index.ts"),
      output: {
        entryFileNames: "content.js",
        format: "iife",
      },
    },
  },
});
