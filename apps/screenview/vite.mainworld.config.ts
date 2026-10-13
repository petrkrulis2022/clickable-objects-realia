import { defineConfig } from "vite";
import { resolve } from "node:path";

// The MAIN-world content script (the share watcher; manifest.json
// declares "world": "MAIN" for this entry). Single-file IIFE, same
// reasoning as vite.content.config.ts. Pattern copied from
// apps/vennmeet/vite.mainworld.config.ts.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "src/mainWorld/index.ts"),
      output: {
        entryFileNames: "mainWorld.js",
        format: "iife",
      },
    },
  },
});
