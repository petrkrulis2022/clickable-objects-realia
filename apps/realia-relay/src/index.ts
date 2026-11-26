import { join } from "node:path";
import { createRelay } from "./relay.js";

const PORT = 8787;

// Run from apps/realia-relay (pnpm dev:relay does). The built-in lessons
// live here, with the relay, not in the extension: a lesson file holds
// every answer, so no student's install may carry one.
const relay = createRelay({
  port: PORT,
  dirs: {
    bundledPacks: join(process.cwd(), "packs"),
    customPacks: join(process.cwd(), "custom-packs"),
    reports: join(process.cwd(), "reports"),
    rooms: join(process.cwd(), "rooms"),
  },
});

void relay.listen().then((port) => {
  console.log(`[relay] listening on ws://localhost:${port} (packs, audio and reports served over the same port)`);
});
