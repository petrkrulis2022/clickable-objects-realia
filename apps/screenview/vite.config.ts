import { defineConfig } from "vite";
import { resolve } from "node:path";

// Builds the two extension pages (options, popup). The content script
// and the service worker are built separately (vite.content.config.ts,
// vite.background.config.ts) — same reasoning as apps/vennmeet.
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
