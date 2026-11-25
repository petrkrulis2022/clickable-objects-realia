import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadValidPack, type LessonEvent } from "@realia/shared";
import { buildSeed, renderReport } from "./report.js";

// Run with TZ=UTC and LANG=en_US.UTF-8 (the package's test script sets
// both): the report prints a localised date.

const ROOT = join(import.meta.dirname, "..");
const PACKS = join(ROOT, "..", "realia", "public", "packs");
const legacyPack = () => loadValidPack(JSON.parse(readFileSync(join(PACKS, "a2-prepositions-place.json"), "utf8")));
const demoPack = () => loadValidPack(JSON.parse(readFileSync(join(PACKS, "demo-modals.json"), "utf8")));

function fixtureEvents(): LessonEvent[] {
  return readFileSync(join(ROOT, "fixtures", "sample-lesson.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

test("a place-only lesson's report is unchanged from before the generalisation", () => {
  const html = renderReport({ code: "FIXTURE", events: fixtureEvents(), pack: legacyPack() });
  assert.equal(html, readFileSync(join(ROOT, "test-fixtures", "sample-lesson.report.golden.html"), "utf8"));
});

test("a sort/gap/match lesson's report names targets by activity and lists wrong placements", () => {
  const t = 1_800_000_000_000;
  const events: LessonEvent[] = [
    { t, type: "session", phase: "start" },
    { t, type: "item", index: 0, prompt: "Sort" },
    { t: t + 1000, type: "drop", objectId: "dont-have-to", zoneId: "bin-forbidden", correct: false, msSinceItemStart: 1000 },
    { t: t + 2000, type: "drop", objectId: "dont-have-to", zoneId: "bin-forbidden", correct: false, msSinceItemStart: 2000 },
    { t: t + 3000, type: "drop", objectId: "dont-have-to", zoneId: "bin-not-necessary", correct: true, msSinceItemStart: 3000 },
    { t: t + 4000, type: "item", index: 1, prompt: "Gap" },
    { t: t + 5000, type: "drop", objectId: "mustnt", zoneId: "gap-3", correct: false, msSinceItemStart: 1000 },
    { t: t + 60_000, type: "session", phase: "end" },
  ];
  const pack = demoPack();
  const html = renderReport({ code: "X", events, pack });
  assert.match(html, /Where answers went wrong, worst first/);
  assert.match(html, /demo: forbidden/);
  assert.match(html, /demo: gap 3/);
  assert.match(html, /<h2>Wrong placements<\/h2>/);
  assert.match(html, /<strong>don&#39;t have to<\/strong> → forbidden \(2×\)/);
  assert.match(html, /<strong>mustn&#39;t<\/strong> → gap 3/);

  const seed = buildSeed({ code: "X", events, pack });
  assert.equal(seed.packId, "demo-modals");
  assert.deepEqual(seed.mistakes[0], { placed: "don't have to", into: "forbidden", count: 2 });
});
