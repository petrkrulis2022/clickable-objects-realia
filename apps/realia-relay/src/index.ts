import { join } from "node:path";
import { createRelay } from "./relay.js";

const PORT = 8787;

// Run from apps/realia-relay (pnpm dev:relay does). Bundled packs are
// read straight from the extension's source so both sides resolve the
// same file; everything the relay writes stays in its own directory.
const relay = createRelay({
  port: PORT,
  dirs: {
    bundledPacks: join(process.cwd(), "..", "realia", "public", "packs"),
    customPacks: join(process.cwd(), "custom-packs"),
    reports: join(process.cwd(), "reports"),
    rooms: join(process.cwd(), "rooms"),
  },
});

void relay.listen().then((port) => {
  console.log(`[relay] listening on ws://localhost:${port} (packs, audio and reports served over the same port)`);
});
