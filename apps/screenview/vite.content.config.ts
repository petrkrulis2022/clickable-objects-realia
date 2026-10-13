import { defineConfig } from "vite";
import { resolve } from "node:path";

// The content script, single-file IIFE (content scripts can't load as
// ES modules via manifest.json). It uses dynamic import() to pick
// between ./interview and ./practiceUi at runtime — inlineDynamicImports
// is required here because Rollup's iife format can't emit multiple
// chunks; both modules end up in this one file regardless; see
// content/index.ts's own comment for why that's still fine — the
// mode check plus the absence of network/mic code in the interview
// module is the real guarantee, not which file the bytes live in.
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
        inlineDynamicImports: true,
      },
    },
  },
});
