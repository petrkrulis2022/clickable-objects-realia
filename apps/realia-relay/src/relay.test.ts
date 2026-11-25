import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import type { ServerMessage } from "@realia/shared";

type StateMsg = Extract<ServerMessage, { type: "state" }>;
type VerdictMsg = Extract<ServerMessage, { type: "verdict" }>;
import { createRelay } from "./relay.js";

// End to end, over real sockets: a non-default pack is selected by
// the teacher, played by both sides, and appears in the report.

const PACKS = join(import.meta.dirname, "..", "..", "realia", "public", "packs");
const EXTENSION_ORIGIN = `chrome-extension://${"a".repeat(32)}`;

let tmp: string;
let relay: ReturnType<typeof createRelay>;
let base: string;
let wsUrl: string;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "realia-relay-test-"));
  relay = createRelay({
    port: 0,
    dirs: { bundledPacks: PACKS, customPacks: join(tmp, "custom"), reports: join(tmp, "reports"), rooms: join(tmp, "rooms") },
    log: () => {},
  });
  const port = await relay.listen();
  base = `http://localhost:${port}`;
  wsUrl = `ws://localhost:${port}`;
});

after(async () => {
  await relay.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** A client that buffers everything it receives so a test can wait for a particular message. */
async function client() {
  const ws = new WebSocket(wsUrl);
  const inbox: ServerMessage[] = [];
  const waiters: Array<() => void> = [];
  ws.on("message", (raw) => {
    inbox.push(JSON.parse(raw.toString()));
    waiters.splice(0).forEach((w) => w());
  });
  await new Promise((resolve) => ws.once("open", resolve));
  return {
    ws,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    async waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<T> {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const i = inbox.findIndex(pred);
        if (i >= 0) return inbox.splice(i, 1)[0] as T;
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`timed out; inbox: ${JSON.stringify(inbox).slice(0, 500)}`);
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, left);
          waiters.push(() => {
            clearTimeout(t);
            resolve();
          });
        });
      }
    },
  };
}

async function waitUntil(check: () => unknown, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 20));
  }
}

test("a non-default pack is selected by the teacher, played by both sides, and appears in the report", async () => {
  const code = "PLAY01";
  const teacher = await client();
  teacher.send({ type: "join", code, packId: "demo-modals" });
  const tState = await teacher.waitFor<StateMsg>((m) => m.type === "state");
  assert.equal(tState.yourRole, "teacher");
  assert.deepEqual(tState.state.activity, { packId: "demo-modals", itemIndex: 0 });
  assert.ok(tState.state.objects["bin-forbidden"], "the room starts on the teacher's pack");

  // The student's own saved selection is ignored: they get the teacher's pack.
  const student = await client();
  student.send({ type: "join", code, packId: "a2-prepositions-place" });
  const sState = await student.waitFor<StateMsg>((m) => m.type === "state");
  assert.equal(sState.yourRole, "student");
  assert.equal(sState.state.activity?.packId, "demo-modals");

  // The student sorts one right and one wrong; the teacher sees the patches.
  student.send({ type: "move", id: "mustnt", pos: { x: 0.2, y: 0.4 } });
  student.send({ type: "drop", id: "mustnt", zoneId: "bin-forbidden" });
  const v1 = await student.waitFor<VerdictMsg>((m) => m.type === "verdict");
  assert.equal(v1.correct, true);
  await teacher.waitFor((m) => m.type === "patch" && m.changed.some((o) => o.id === "mustnt" && !o.heldBy));

  student.send({ type: "move", id: "dont-have-to", pos: { x: 0.2, y: 0.4 } });
  student.send({ type: "drop", id: "dont-have-to", zoneId: "bin-forbidden" });
  const v2 = await student.waitFor<VerdictMsg>((m) => m.type === "verdict");
  assert.equal(v2.correct, false);

  // The teacher moves on to the gap activity; both sides get it.
  teacher.send({ type: "setActivity", packId: "demo-modals", itemIndex: 1 });
  await student.waitFor((m) => m.type === "patch" && m.changed.some((o) => o.id === "gap-1"));

  teacher.ws.close();
  student.ws.close();
  await waitUntil(() => relay.reportTokenFor(code));

  const html = await (await fetch(`${base}/r/${code}/${relay.reportTokenFor(code)}`)).text();
  assert.match(html, /Where answers went wrong, worst first/);
  assert.match(html, /demo: forbidden/);
  assert.match(html, /<strong>don&#39;t have to<\/strong> → forbidden/);

  const seed = (await (await fetch(`${base}/reports/latest-seed?packId=demo-modals`)).json()) as { packId: string; code: string };
  assert.equal(seed.packId, "demo-modals");
  assert.equal(seed.code, code);
});

test("CORS: the extension and Meet may call the relay; other websites may not", async () => {
  const fromMeet = await fetch(`${base}/packs/demo-modals`, { headers: { origin: "https://meet.google.com" } });
  assert.equal(fromMeet.status, 200);
  assert.equal(fromMeet.headers.get("access-control-allow-origin"), "https://meet.google.com");

  const preflight = await fetch(`${base}/packs`, {
    method: "OPTIONS",
    headers: { origin: EXTENSION_ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
  assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /content-type/);

  const fromElsewhere = await fetch(`${base}/packs/demo-modals`, { headers: { origin: "https://example.com" } });
  assert.equal(fromElsewhere.status, 403);
  assert.equal(fromElsewhere.headers.get("access-control-allow-origin"), null);
});

test("GET /packs lists the bundled packs, and serves them normalised", async () => {
  const { packs } = (await (await fetch(`${base}/packs`)).json()) as { packs: { id: string }[] };
  const ids = packs.map((p) => p.id);
  assert.ok(ids.includes("a2-prepositions-place") && ids.includes("demo-modals"));
  const legacy = (await (await fetch(`${base}/packs/a2-prepositions-place`)).json()) as {
    items: { kind: string; pairs: unknown }[];
  };
  assert.equal(legacy.items[0].kind, "place");
  assert.deepEqual(legacy.items[0].pairs, [{ objectId: "keys", zoneId: "on_table" }]);
});

function postPack(body: unknown, contentType = "application/json") {
  return fetch(`${base}/packs`, { method: "POST", headers: { "content-type": contentType }, body: JSON.stringify(body) });
}

function demoPackWithId(id: string) {
  const pack = JSON.parse(readFileSync(join(PACKS, "demo-modals.json"), "utf8"));
  pack.id = id;
  return pack;
}

test("POST /packs refuses anything that is not a valid pack with mp3 audio", async () => {
  assert.equal((await postPack({ pack: demoPackWithId("x1") }, "text/plain")).status, 415, "JSON only");

  const invalid = demoPackWithId("x2");
  invalid.items[0].pairs = [];
  const r1 = await postPack({ pack: invalid });
  assert.equal(r1.status, 422);
  assert.ok(((await r1.json()) as { problems: string[] }).problems.some((p) => /zero pairs/.test(p)));

  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString("base64");
  const withImage = demoPackWithId("x3");
  withImage.cards[0].audio = { normal: "/packs/x3/audio/a-normal.mp3", slow: "/packs/x3/audio/a-slow.mp3" };
  const r2 = await postPack({ pack: withImage, audio: { "a-normal.mp3": jpegBytes, "a-slow.mp3": jpegBytes } });
  assert.equal(r2.status, 415, "an image posted as audio is refused");

  assert.equal((await postPack({ pack: demoPackWithId("demo-modals") })).status, 409, "a shipped pack cannot be replaced");
});

test("POST /packs stores an approved pack with its audio and plan, and serves them back", async () => {
  const mp3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(64)]).toString("base64");
  const pack = demoPackWithId("lesson-test-1");
  pack.cards[0].audio = { normal: "/packs/lesson-test-1/audio/c-obligation-normal.mp3", slow: "/packs/lesson-test-1/audio/c-obligation-slow.mp3" };
  const res = await postPack({
    pack,
    audio: { "c-obligation-normal.mp3": mp3, "c-obligation-slow.mp3": mp3 },
    plan: "# Plan\n\nAnswer key: …",
  });
  assert.equal(res.status, 200, await res.clone().text());

  const audio = await fetch(`${base}/packs/lesson-test-1/audio/c-obligation-normal.mp3`);
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");
  assert.equal(await (await fetch(`${base}/packs/lesson-test-1/plan`)).text(), "# Plan\n\nAnswer key: …");
  assert.equal((await fetch(`${base}/packs/lesson-test-1/audio/..%2F..%2Flesson-test-1.json`)).status, 404);

  const missingAudio = demoPackWithId("lesson-test-2");
  missingAudio.cards[0].audio = { normal: "/packs/lesson-test-2/audio/nope-normal.mp3", slow: "/packs/lesson-test-2/audio/nope-slow.mp3" };
  assert.equal((await postPack({ pack: missingAudio })).status, 422, "a pack cannot point at audio that does not exist");
});
