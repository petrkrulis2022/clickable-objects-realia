import { defineConfig } from "vite";
import { resolve } from "node:path";

// Builds the popup and options pages. The content script is built
// separately by vite.content.config.ts because it must ship as a
// single classic script (no code-splitting) for the manifest's
// content_scripts entry.
export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        options: resolve(__dirname, "options.html"),
      },
    },
  },
});
