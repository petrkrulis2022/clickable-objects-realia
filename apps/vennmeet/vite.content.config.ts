import { defineConfig } from "vite";
import { resolve } from "node:path";

// The ISOLATED-world content script (the layer). Single-file IIFE —
// run after the main config so it doesn't wipe its output
// (emptyOutDir: false).
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
