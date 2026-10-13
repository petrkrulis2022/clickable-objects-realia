import { defineConfig } from "vite";
import { resolve } from "node:path";

// Builds the two extension pages (options, popup). The content
// script, main-world script and service worker are built separately
// (vite.content.config.ts, vite.mainworld.config.ts,
// vite.background.config.ts) because content scripts can't be loaded
// as ES modules via manifest.json, so they need single-file IIFE
// output with no code-splitting.
export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: resolve(__dirname, "options.html"),
        popup: resolve(__dirname, "popup.html"),
      },
    },
  },
});
