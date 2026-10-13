#!/usr/bin/env node
// Build check (docs/SPEC-VENNMEET.md, "1. Scaffold and the no-network
// guarantee"): "Build checks that fail if: manifest requests any
// permission beyond storage." host_permissions is a separate manifest
// key (the four platform domains) and is allowed; this only checks
// the `permissions` array itself.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const manifestPath = join(import.meta.dirname, "..", "public", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const permissions = manifest.permissions ?? [];
const extra = permissions.filter((p) => p !== "storage");

if (extra.length > 0) {
  console.error(
    `[check-permissions] manifest.json requests permissions beyond "storage": ${extra.join(", ")}`,
  );
  process.exit(1);
}

console.log("[check-permissions] ok — permissions is storage-only");
