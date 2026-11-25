import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadValidPack, validatePack } from "@realia/shared";
import {
  ACTIVITY_REPLACEMENT_SCHEMA,
  draftRealiaLesson,
  GeneratorError,
  LESSON_SCHEMA,
  regenerateActivity,
  type LessonBrief,
} from "./realiaLesson.js";
import { sampleLesson, scriptedLlm, sentinelJpegBase64 } from "./testSupport.js";

const brief: LessonBrief = {
  door: "coursebook",
  lengthMinutes: 60,
  format: "one-to-one",
  level: "B1",
  firstLanguage: "Czech",
  doneAndNew: "Vocabulary page was homework; modals are revision.",
  focus: "mustn't vs don't have to",
};
const photo = { filename: "page1.jpg", mediaType: "image/jpeg" as const, base64: sentinelJpegBase64("PAGE-ONE") };
const ok = (lesson: unknown) => ({ text: JSON.stringify(lesson) });
const legacyPack = () =>
  loadValidPack(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "realia", "public", "packs", "a2-prepositions-place.json"), "utf8")));

test("a well-formed answer becomes a valid pack and a plan, with sorts and gaps — not just place", async () => {
  const llm = scriptedLlm([ok(sampleLesson())]);
  const draft = await draftRealiaLesson({ packId: "lesson-test", brief, images: [photo], documents: [] }, llm);

  assert.deepEqual(validatePack(draft.pack), []);
  assert.equal(draft.attempts, 1);
  assert.deepEqual(draft.pack.items.map((i) => i.kind), ["sort", "gap", "match"]);
  assert.match(draft.plan, /Answer key/);
  assert.deepEqual(draft.teachNormally, [{ exercise: "Speaking 5", why: "Free speaking — talk, don't drag." }]);
  // Zones are namespaced by activity, so two activities can't collide on "1".
  assert.ok(draft.pack.zones.some((z) => z.id === "g3--1" && z.label === "1"));
  // New words start silent; approval records them.
  assert.deepEqual(draft.pack.cards, [{ id: "c-obligation", word: "obligation", translation: "povinnost", emoji: "📋", audio: null }]);
  assert.ok(!draft.pack.draggables.some((d) => d.id === "unused"), "objects no activity uses are dropped");
});

test("the photos go to the model first, as images, followed by the brief", async () => {
  const llm = scriptedLlm([ok(sampleLesson())]);
  await draftRealiaLesson({ packId: "lesson-test", brief, images: [photo], documents: [] }, llm);
  const [call] = llm.calls;
  assert.equal(call.content[0].type, "image");
  assert.equal(call.content[0].type === "image" && call.content[0].base64, photo.base64);
  const text = call.content[1].type === "text" ? call.content[1].text : "";
  assert.match(text, /level B1, first language Czech/);
  assert.match(text, /mustn't vs don't have to/);
  assert.match(text, /Photos of 1 coursebook page/);
});

test("an invalid first answer is retried once, with the problems spelled out", async () => {
  const bad = sampleLesson();
  bad.activities[0].pairs.push({ object_id: "ghost", zone_id: "forbidden" });
  const llm = scriptedLlm([ok(bad), ok(sampleLesson())]);
  const draft = await draftRealiaLesson({ packId: "lesson-test", brief, images: [photo], documents: [] }, llm);

  assert.equal(draft.attempts, 2);
  assert.equal(llm.calls.length, 2);
  const retryText = llm.calls[1].content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  assert.match(retryText, /unknown object "ghost"/);
  assert.equal(llm.calls[1].content[0].type, "image", "the retry still sees the pages");
});

test("two invalid answers fail with the problems and the raw output, and nothing loadable", async () => {
  const bad = sampleLesson();
  bad.activities[1].prompt = "No gap markers here.";
  const llm = scriptedLlm([ok(bad)]);
  await assert.rejects(
    draftRealiaLesson({ packId: "lesson-test", brief, images: [], documents: [] }, llm),
    (err: unknown) =>
      err instanceof GeneratorError &&
      err.problems.some((p) => /does not show gap \[1\]/.test(p)) &&
      err.raw.includes("No gap markers here."),
  );
  assert.equal(llm.calls.length, 2, "exactly one retry");
});

test("a refusal is reported, not parsed", async () => {
  const llm = scriptedLlm([{ text: "", stopReason: "refusal" }]);
  await assert.rejects(
    draftRealiaLesson({ packId: "lesson-test", brief, images: [], documents: [] }, llm),
    (err: unknown) => err instanceof GeneratorError && err.problems.some((p) => /declined/.test(p)),
  );
});

test("an empty plan is not accepted — the plan is what makes the pack trustworthy", async () => {
  const noPlan = { ...sampleLesson(), plan_markdown: "  " };
  const llm = scriptedLlm([ok(noPlan)]);
  await assert.rejects(
    draftRealiaLesson({ packId: "lesson-test", brief, images: [], documents: [] }, llm),
    (err: unknown) => err instanceof GeneratorError && err.problems.includes("The teaching plan is empty."),
  );
});

test("from last lesson: place activities reuse the previous pack's scenery, zones, objects and recorded cards", async () => {
  const lesson = {
    ...sampleLesson(),
    objects: [],
    cards: [{ id: "c_keys", word: "keys", translation: "klíče", emoji: "🔑" }],
    activities: [
      { id: "p1", kind: "place", source_exercise: "last lesson", prompt: "Put the keys under the chair.", feedback: "", zones: [], pairs: [{ object_id: "keys", zone_id: "under_chair" }], distractors: [] },
      { id: "p2", kind: "place", source_exercise: "last lesson", prompt: "Put the ball between the chair and the table.", feedback: "", zones: [], pairs: [{ object_id: "ball", zone_id: "between_chair_table" }], distractors: [] },
    ],
  };
  const llm = scriptedLlm([ok(lesson)]);
  const draft = await draftRealiaLesson(
    {
      packId: "lesson-next",
      brief: { ...brief, door: "last-lesson" },
      images: [],
      documents: [],
      referencePack: legacyPack(),
      lastLesson: { weakestRelations: [{ relation: "between", attempts: 3, errorRate: 0.67 }] },
    },
    llm,
  );
  assert.deepEqual(validatePack(draft.pack), []);
  assert.equal(draft.pack.scenery.length, 3);
  assert.ok(draft.pack.zones.some((z) => z.id === "between_chair_table" && z.anchor === "both"));
  assert.equal(draft.pack.cards[0].audio, undefined, "a reused card keeps its bundled recording");
  const text = llm.calls[0].content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  assert.match(text, /between \(67% missed\)/);
});

test("place is refused without a previous pack to anchor it to", async () => {
  const lesson = {
    ...sampleLesson(),
    activities: [{ id: "p1", kind: "place", source_exercise: "x", prompt: "Put it on the table.", feedback: "", zones: [], pairs: [{ object_id: "mustnt", zone_id: "on_table" }], distractors: [] }],
  };
  const llm = scriptedLlm([ok(lesson)]);
  await assert.rejects(draftRealiaLesson({ packId: "lesson-test", brief, images: [], documents: [] }, llm), GeneratorError);
});

test("regenerating one activity replaces it in place, drops its old zones, and sends no photos", async () => {
  const first = await draftRealiaLesson({ packId: "lesson-test", brief, images: [photo], documents: [] }, scriptedLlm([ok(sampleLesson())]));
  const replacement = {
    activity: {
      id: "anything",
      kind: "match",
      source_exercise: "Grammar 1a",
      prompt: "Match each verb with its meaning.",
      feedback: "",
      zones: [
        { id: "a", label: "it is forbidden" },
        { id: "b", label: "it is not necessary" },
      ],
      pairs: [
        { object_id: "mustnt", zone_id: "a" },
        { object_id: "needn-t", zone_id: "b" },
      ],
      distractors: [],
    },
    objects: [{ id: "needn-t", label: "needn't", emoji: "" }],
  };
  const llm = scriptedLlm([ok(replacement)]);
  const { pack } = await regenerateActivity({ brief, pack: first.pack, plan: first.plan, activityId: "g1a" }, llm);

  assert.deepEqual(validatePack(pack), []);
  assert.equal(pack.items[0].id, "g1a", "keeps its id and position");
  assert.equal(pack.items[0].kind, "match");
  assert.ok(!pack.zones.some((z) => z.id === "g1a--forbidden"), "the old sort's bins are gone");
  assert.ok(pack.draggables.some((d) => d.id === "needn-t"));
  assert.ok(!pack.draggables.some((d) => d.id === "cant"), "objects only the old activity used are dropped");
  assert.ok(llm.calls[0].content.every((b) => b.type === "text"), "no photos on a regenerate: they were discarded");
});

test("gap distractors come through as wrong-answer chips; a gap without them is sent back", async () => {
  const draft = await draftRealiaLesson({ packId: "lesson-test", brief, images: [], documents: [] }, scriptedLlm([ok(sampleLesson())]));
  const gap = draft.pack.items.find((i) => i.kind === "gap")!;
  assert.deepEqual(gap.distractors, ["must-to", "dont-must"]);
  assert.ok(draft.pack.draggables.some((d) => d.id === "must-to"), "distractor objects are kept");

  const noDistractors = sampleLesson();
  noDistractors.activities[1].distractors = [];
  const llm = scriptedLlm([ok(noDistractors), ok(sampleLesson())]);
  const retried = await draftRealiaLesson({ packId: "lesson-test", brief, images: [], documents: [] }, llm);
  assert.equal(retried.attempts, 2);
  const retryText = llm.calls[1].content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  assert.match(retryText, /needs at least two distractors/);
});

test("the schemas only use what structured outputs supports", () => {
  const forbidden = ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "pattern"];
  function walk(node: unknown, path: string) {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    for (const key of forbidden) assert.ok(!(key in n), `${path} uses unsupported "${key}"`);
    if (n.type === "object") {
      assert.equal(n.additionalProperties, false, `${path} must set additionalProperties: false`);
      assert.deepEqual([...(n.required as string[])].sort(), Object.keys(n.properties as object).sort(), `${path} must require every property`);
    }
    for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`);
  }
  walk(LESSON_SCHEMA, "lesson");
  walk(ACTIVITY_REPLACEMENT_SCHEMA, "replacement");
});
