import { defineConfig } from "vite";
import { resolve } from "node:path";

// manifest.json declares "type": "module" for the service worker, so
// (unlike the content script) it can be a real ES module.
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
