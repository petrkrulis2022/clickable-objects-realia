import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createNullLlmClient } from "./llm.js";
import { createAssistServer } from "./server.js";
import { sampleLesson, scriptedLlm, sentinelJpegBase64 } from "./testSupport.js";

const EXTENSION = `chrome-extension://${"b".repeat(32)}`;
const brief = {
  door: "coursebook",
  lengthMinutes: 60,
  format: "one-to-one",
  level: "B1",
  firstLanguage: "Czech",
  doneAndNew: "",
};
const noExtractors = {
  extractPdf: async () => "",
  extractDocx: async () => "",
  transcribeAudio: async () => "",
};

async function start(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}
async function stop(server: Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: EXTENSION, ...headers },
    body: JSON.stringify(body),
  });
}

/** Every file under `dir` changed since `since`, to a depth — where image bytes could have been left behind. */
function filesTouchedSince(dir: string, since: number, depth = 3): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const path = join(dir, name);
    let st;
    try {
      st = statSync(path);
    } catch {
      continue;
    }
    if (st.isDirectory() && depth > 0) out.push(...filesTouchedSince(path, since, depth - 1));
    else if (st.isFile() && st.mtimeMs >= since) out.push(path);
  }
  return out;
}

test("CORS: the extension's pages may call the service; websites may not", async () => {
  const server = createAssistServer({ llm: createNullLlmClient(), llmConfigured: false, model: "m", extractors: noExtractors, tts: null, log: () => {} });
  const base = await start(server);
  try {
    const preflight = await fetch(`${base}/plan/draft`, {
      method: "OPTIONS",
      headers: { origin: EXTENSION, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), EXTENSION);

    const fromWebsite = await post(base, "/plan/draft", { product: "realia", brief }, { origin: "https://example.com" });
    assert.equal(fromWebsite.status, 403);
    assert.equal(fromWebsite.headers.get("access-control-allow-origin"), null);

    const notJson = await fetch(`${base}/plan/draft`, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    assert.equal(notJson.status, 415, "a simple cross-site form post can't trigger a draft");

    const status = await (await fetch(`${base}/status`, { headers: { origin: EXTENSION } })).json();
    assert.deepEqual(status, { anthropic: false, elevenLabs: false, model: "m" });
  } finally {
    await stop(server);
  }
});

test("without ANTHROPIC_API_KEY a draft fails clearly instead of returning anything fake", async () => {
  const server = createAssistServer({ llm: createNullLlmClient(), llmConfigured: false, model: "m", extractors: noExtractors, tts: null, log: () => {} });
  const base = await start(server);
  try {
    const res = await post(base, "/plan/draft", { product: "realia", brief, materials: [] });
    assert.equal(res.status, 503);
    assert.match(((await res.json()) as { error: string }).error, /ANTHROPIC_API_KEY/);
  } finally {
    await stop(server);
  }
});

test("a file that claims to be a photo but isn't one is refused", async () => {
  const llm = scriptedLlm([{ text: JSON.stringify(sampleLesson()) }]);
  const server = createAssistServer({ llm, llmConfigured: true, model: "m", extractors: noExtractors, tts: null, log: () => {} });
  const base = await start(server);
  try {
    const res = await post(base, "/plan/draft", {
      product: "realia",
      brief,
      materials: [{ kind: "image", filename: "x.jpg", mediaType: "image/jpeg", base64: Buffer.from("not a jpeg").toString("base64") }],
    });
    assert.equal(res.status, 400);
    assert.equal(llm.calls.length, 0);
  } finally {
    await stop(server);
  }
});

test("IMAGES ARE TRANSIENT: no image bytes survive the request", async () => {
  const marker = `SENTINEL-${process.pid}-${Date.now()}`;
  const photo = sentinelJpegBase64(marker);
  const tmp = mkdtempSync(join(tmpdir(), "assist-transience-"));
  const previousCwd = process.cwd();
  process.chdir(tmp); // anything written to a relative path would land here
  const logs: string[] = [];
  const originalConsole = { log: console.log, error: console.error, warn: console.warn };
  for (const k of ["log", "error", "warn"] as const) console[k] = (...a: unknown[]) => void logs.push(a.map(String).join(" "));

  const bad = sampleLesson();
  bad.activities[0].pairs.push({ object_id: "ghost", zone_id: "forbidden" });
  // First request: valid. Second: fails twice, so the raw-output error path is exercised too.
  const llm = scriptedLlm([{ text: JSON.stringify(sampleLesson()) }]);
  const failing = scriptedLlm([{ text: JSON.stringify(bad) }]);
  const server = createAssistServer({ llm, llmConfigured: true, model: "m", extractors: noExtractors, tts: null, log: (m) => logs.push(m) });
  const failingServer = createAssistServer({ llm: failing, llmConfigured: true, model: "m", extractors: noExtractors, tts: null, log: (m) => logs.push(m) });
  const started = Date.now() - 1000;
  try {
    const base = await start(server);
    const failingBase = await start(failingServer);
    const materials = [{ kind: "image", filename: "page.jpg", mediaType: "image/jpeg", base64: photo }];

    // 1. The model did receive the photo (so this test means something).
    const res = await post(base, "/plan/draft", { product: "realia", brief, materials });
    assert.equal(res.status, 200);
    const responseText = await res.text();
    const sent = llm.calls[0].content.find((b) => b.type === "image");
    assert.equal(sent && sent.type === "image" ? sent.base64 : null, photo);

    // 2. Not in the response — neither as base64 nor as raw bytes.
    assert.ok(!responseText.includes(photo), "response contains the image base64");
    assert.ok(!responseText.includes(marker), "response contains the image bytes");

    // 3. Not in the failure response either (problems + the model's raw output).
    const failed = await post(failingBase, "/plan/draft", { product: "realia", brief, materials });
    assert.equal(failed.status, 422);
    const failedText = await failed.text();
    assert.ok(!failedText.includes(photo) && !failedText.includes(marker), "error response contains the image");

    // 4. Not on disk: nothing written to the working directory, and no file anywhere under the temp dir holds it.
    assert.deepEqual(readdirSync(tmp), [], "the service wrote files during the request");
    for (const file of filesTouchedSince(tmpdir(), started)) {
      let content: Buffer;
      try {
        content = readFileSync(file);
      } catch {
        continue;
      }
      assert.ok(!content.includes(marker) && !content.includes(photo), `image bytes found on disk in ${file}`);
    }

    // 5. Not in the logs.
    assert.ok(logs.length > 0, "the request was logged (without its body)");
    assert.ok(logs.every((l) => !l.includes(marker) && !l.includes(photo)), "image bytes were logged");

    // 6. Not kept in memory for later: a following request without photos gets no images at all.
    const draft = JSON.parse(responseText).draft;
    const regen = scriptedLlm([{ text: JSON.stringify({ activity: sampleLesson().activities[2], objects: [] }) }]);
    const regenServer = createAssistServer({ llm: regen, llmConfigured: true, model: "m", extractors: noExtractors, tts: null, log: () => {} });
    const regenBase = await start(regenServer);
    const second = await post(regenBase, "/plan/draft", { product: "realia", mode: "regenerate", brief, pack: draft.pack, plan: draft.plan, activityId: "g2" });
    assert.equal(second.status, 200);
    assert.ok(regen.calls[0].content.every((b) => b.type === "text"), "a later request received an image");
    const secondText = await second.text();
    assert.ok(!secondText.includes(marker));
    await stop(regenServer);
  } finally {
    await stop(server);
    await stop(failingServer);
    Object.assign(console, originalConsole);
    process.chdir(previousCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("approval: new cards come back silent and marked when there's no ElevenLabs key", async () => {
  const llm = scriptedLlm([{ text: JSON.stringify(sampleLesson()) }]);
  const server = createAssistServer({ llm, llmConfigured: true, model: "m", extractors: noExtractors, tts: null, log: () => {} });
  const base = await start(server);
  try {
    const { draft } = (await (await post(base, "/plan/draft", { product: "realia", brief, materials: [] })).json()) as {
      draft: { pack: unknown };
    };
    const res = await post(base, "/plan/audio", { pack: draft.pack });
    assert.equal(res.status, 200);
    const out = (await res.json()) as { silent: string[]; reason: string; audio: object };
    assert.deepEqual(out.silent, ["c-obligation"]);
    assert.deepEqual(out.audio, {});
    assert.match(out.reason, /ELEVENLABS_API_KEY/);
  } finally {
    await stop(server);
  }
});
