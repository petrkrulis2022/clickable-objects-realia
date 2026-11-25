import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  binCapacity,
  gapTextId,
  loadValidPack,
  normalizePack,
  PackValidationError,
  resolveItem,
  snapPosition,
  validatePack,
  zoneCapacity,
  type LessonPack,
  type StageObject,
  type Zone,
} from "./index.js";

const HERE = import.meta.dirname;
const BUNDLED_PACKS = join(HERE, "..", "..", "..", "apps", "realia", "public", "packs");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const legacyRaw = () => readJson(join(BUNDLED_PACKS, "a2-prepositions-place.json"));
const demoRaw = () => readJson(join(BUNDLED_PACKS, "demo-modals.json"));

function zonesOf(objects: StageObject[]): Zone[] {
  return objects.filter((o): o is Zone => o.kind === "zone");
}

// --- The shipped lesson must be untouched. ---

test("the shipped a2-prepositions-place pack resolves byte-identically to the pre-change capture", () => {
  const pack = loadValidPack(legacyRaw());
  const resolved = pack.items.map((_, i) => resolveItem(pack, i));
  const golden = readFileSync(join(HERE, "..", "test-fixtures", "a2-prepositions-place.resolved.golden.json"), "utf8");
  assert.equal(JSON.stringify(resolved, null, 2) + "\n", golden);
});

test("the original on-disk format normalises to place items with one pair each", () => {
  const pack = normalizePack(legacyRaw());
  assert.equal(pack.items.length, 10);
  assert.deepEqual(pack.items[0], {
    id: "item-1",
    kind: "place",
    prompt: "Put the keys on the table.",
    pairs: [{ objectId: "keys", zoneId: "on_table" }],
    backdrop: "livingroom",
  });
  assert.equal(pack.zones[0].label, "on_table", "an unlabelled original zone keeps its id as its label");
});

// --- The new kinds load and lay out. ---

test("a hand-written pack with sort, gap and match items is valid", () => {
  assert.deepEqual(validatePack(normalizePack(demoRaw())), []);
});

test("sort: one bin accepts several objects", () => {
  const pack = loadValidPack(demoRaw());
  const { objects } = resolveItem(pack, 0);
  const forbidden = zonesOf(objects).find((z) => z.id === "bin-forbidden")!;
  assert.deepEqual(forbidden.accepts, ["mustnt", "cant"]);
  assert.equal(forbidden.variant, "bin");
  assert.equal(forbidden.label, "forbidden");
  assert.equal(forbidden.feedback, "Yes, that's where it belongs.");
});

test("gap: an object can be correct in more than one zone, and the text is displayed", () => {
  const pack = loadValidPack(demoRaw());
  const { objects } = resolveItem(pack, 1);
  const zones = zonesOf(objects);
  assert.ok(zones.find((z) => z.id === "gap-1")!.accepts.includes("must"));
  assert.ok(zones.find((z) => z.id === "gap-4")!.accepts.includes("must"));
  const text = objects.find((o) => o.id === gapTextId(pack.items[1]))!;
  assert.equal(text.kind, "text");
  assert.match(text.label, /\[1\]/);
  assert.ok(zones.every((z) => z.variant === "slot"));
});

test("match: every zone accepts exactly its one object", () => {
  const pack = loadValidPack(demoRaw());
  const zones = zonesOf(resolveItem(pack, 2).objects);
  assert.equal(zones.length, 3);
  assert.ok(zones.every((z) => z.accepts.length === 1));
});

test("generalised items show only their own objects as chips, plus the reveal cards", () => {
  const pack = loadValidPack(demoRaw());
  const { objects } = resolveItem(pack, 2);
  const chips = objects.filter((o) => o.kind === "draggable");
  assert.deepEqual(chips.map((c) => c.id).sort(), ["advice-lie-down", "advice-run", "advice-umbrella"]);
  assert.ok(chips.every((c) => c.variant === "chip"));
  assert.equal(objects.filter((o) => o.kind === "card").length, 2);
  assert.equal(objects.filter((o) => o.kind === "label").length, 0, "no scenery outside place items");
});

test("a silent card resolves with audio null; an original card keeps its bundled files", () => {
  const demo = loadValidPack(demoRaw());
  const card = resolveItem(demo, 0).objects.find((o) => o.kind === "card") as { audio: unknown };
  assert.equal(card.audio, null);
  const legacy = loadValidPack(legacyRaw());
  const keys = resolveItem(legacy, 0).objects.find((o) => o.id === "c_keys") as { audio: unknown };
  assert.deepEqual(keys.audio, { normal: "audio/keys-normal.mp3", slow: "audio/keys-slow.mp3" });
});

// --- Snapping. ---

test("bin slots are distinct and stay inside the bin", () => {
  const pack = loadValidPack(demoRaw());
  const { objects } = resolveItem(pack, 0);
  const bin = zonesOf(objects)[0];
  const chip = objects.find((o) => o.kind === "draggable")!;
  const capacity = zoneCapacity(bin, chip.size);
  assert.ok(capacity >= 2);
  const slots = Array.from({ length: capacity }, (_, i) => snapPosition(bin, chip, i));
  assert.equal(new Set(slots.map((s) => `${s.x},${s.y}`)).size, capacity);
  for (const s of slots) {
    assert.ok(s.x >= bin.pos.x && s.x + chip.size.w <= bin.pos.x + bin.size.w + 1e-9);
    assert.ok(s.y >= bin.pos.y && s.y + chip.size.h <= bin.pos.y + bin.size.h + 1e-9);
  }
});

test("an original place zone still snaps to its centre", () => {
  const pack = loadValidPack(legacyRaw());
  const { objects } = resolveItem(pack, 0);
  const zone = zonesOf(objects)[0];
  const keys = objects.find((o) => o.id === "keys")!;
  assert.deepEqual(snapPosition(zone, keys, 0), {
    x: zone.pos.x + zone.size.w / 2 - keys.size.w / 2,
    y: zone.pos.y + zone.size.h / 2 - keys.size.h / 2,
  });
  assert.equal(zoneCapacity(zone, keys.size), Number.POSITIVE_INFINITY);
});

// --- Strict validation: each rule fails on its own. ---

function demo(): LessonPack {
  return normalizePack(demoRaw());
}

function expectProblem(pack: LessonPack, pattern: RegExp) {
  const problems = validatePack(pack);
  assert.ok(problems.some((p) => pattern.test(p)), `expected a problem matching ${pattern}, got: ${JSON.stringify(problems)}`);
}

test("rejects a pair naming an object that does not exist", () => {
  const p = demo();
  p.items[0].pairs.push({ objectId: "nope", zoneId: "bin-forbidden" });
  expectProblem(p, /unknown object "nope"/);
});

test("rejects a pair naming a zone that does not exist", () => {
  const p = demo();
  p.items[0].pairs.push({ objectId: "mustnt", zoneId: "nope" });
  expectProblem(p, /unknown zone "nope"/);
});

test("rejects an item with zero pairs", () => {
  const p = demo();
  p.items[2].pairs = [];
  expectProblem(p, /zero pairs/);
});

test("rejects an empty prompt", () => {
  const p = demo();
  p.items[0].prompt = "  ";
  expectProblem(p, /prompt is empty/);
});

test("rejects more than 8 objects in one item", () => {
  const p = demo();
  for (let i = 0; i < 9; i++) {
    p.draggables.push({ id: `extra-${i}`, label: `x${i}` });
    p.items[0].pairs.push({ objectId: `extra-${i}`, zoneId: "bin-necessary" });
  }
  expectProblem(p, /at most 8/);
});

test("rejects more than 6 zones in one item", () => {
  const p = demo();
  for (let i = 0; i < 6; i++) {
    p.zones.push({ id: `bin-extra-${i}`, label: `bin ${i}` });
    p.items[0].pairs.push({ objectId: "must", zoneId: `bin-extra-${i}` });
  }
  expectProblem(p, /at most 6/);
});

test("rejects a position outside the stage", () => {
  const p = demo();
  p.zones.find((z) => z.id === "bin-forbidden")!.pos = { x: 0.9, y: 0.2 };
  p.zones.find((z) => z.id === "bin-forbidden")!.size = { w: 0.3, h: 0.2 };
  expectProblem(p, /outside the stage/);
});

test("rejects zones that overlap", () => {
  const p = demo();
  const a = p.zones.find((z) => z.id === "match-headache")!;
  const b = p.zones.find((z) => z.id === "match-rain")!;
  a.pos = { x: 0.1, y: 0.2 };
  a.size = { w: 0.3, h: 0.25 };
  b.pos = { x: 0.2, y: 0.25 };
  b.size = { w: 0.3, h: 0.25 };
  expectProblem(p, /overlap/);
});

test("rejects a match that is not one-to-one", () => {
  const p = demo();
  p.items[2].pairs.push({ objectId: "advice-run", zoneId: "match-rain" });
  expectProblem(p, /exactly once/);
});

test("rejects a sort with a single bin", () => {
  const p = demo();
  p.items[0].pairs = p.items[0].pairs.filter((x) => x.zoneId === "bin-forbidden");
  expectProblem(p, /fewer than two bins/);
});

test("rejects gap text that does not show one of its gaps", () => {
  const p = demo();
  p.items[1].prompt = p.items[1].prompt.replace("[3]", "___");
  expectProblem(p, /does not show gap \[3\]/);
});

test("rejects a bin that cannot hold all the objects that belong in it", () => {
  const p = demo();
  // Six bins make each bin one chip wide and four tall; five chips into one bin cannot fit.
  for (let i = 0; i < 3; i++) p.zones.push({ id: `bin-more-${i}`, label: `more ${i}` });
  p.items[0].pairs = [
    ...["mustnt", "cant", "dont-have-to", "neednt", "must"].map((o) => ({ objectId: o, zoneId: "bin-forbidden" })),
    { objectId: "have-to", zoneId: "bin-necessary" },
    { objectId: "must-2", zoneId: "bin-not-necessary" },
    ...[0, 1, 2].map((i) => ({ objectId: "have-to", zoneId: `bin-more-${i}` })),
  ];
  expectProblem(p, /holds \d+ objects but 5 belong/);
});

test("rejects a backdrop that is not an image bundled with the extension", () => {
  const p = demo();
  p.backdrops.page = { src: "https://example.com/coursebook-page.jpg", fit: "cover" };
  expectProblem(p, /bundled with the extension/);
});

test("rejects embedded image data anywhere in the pack's text", () => {
  const p = demo();
  p.draggables[0].label = "data:image/jpeg;base64,/9j/4AAQ";
  expectProblem(p, /embedded data/);
});

test("rejects unsafe ids and audio paths that escape the pack's directory", () => {
  const p = demo();
  p.id = "../etc";
  expectProblem(p, /not a safe id/);
  const q = demo();
  q.cards[0].audio = { normal: "/packs/demo-modals/audio/../../x.mp3", slow: "/packs/demo-modals/audio/a.mp3" };
  expectProblem(q, /audio path .* is not allowed/);
});

test("rejects an id shared by two stage objects", () => {
  const p = demo();
  p.cards[0].id = "mustnt";
  expectProblem(p, /used by both/);
});

test("rejects a sort or gap that tries to use an anchored place zone", () => {
  const p = normalizePack(legacyRaw());
  p.items.push({ id: "bad", kind: "sort", prompt: "x", pairs: [
    { objectId: "keys", zoneId: "on_table" },
    { objectId: "ball", zoneId: "under_table" },
  ] });
  expectProblem(p, /place only/);
});

test("loadValidPack throws with every problem listed", () => {
  const p = demo() as unknown as Record<string, unknown>;
  p.items = [];
  assert.throws(() => loadValidPack(p), (err: unknown) => err instanceof PackValidationError && err.problems.includes("pack has no activities"));
});

test("a true/false sort of sentence-long statements gets wide chips that still fit their bins", () => {
  const p = demo();
  const statements = [
    "You can use must in most questions about rules.",
    "Ought is followed by to, but should is not.",
    "Had better is about general, everyday advice.",
    "Don't have to and mustn't mean the same thing.",
  ];
  statements.forEach((label, i) => p.draggables.push({ id: `tf-${i}`, label }));
  p.zones.push({ id: "bin-true", label: "true" }, { id: "bin-false", label: "false" });
  p.items.push({
    id: "tf",
    kind: "sort",
    prompt: "True or false?",
    pairs: [
      { objectId: "tf-0", zoneId: "bin-false" },
      { objectId: "tf-1", zoneId: "bin-true" },
      { objectId: "tf-2", zoneId: "bin-false" },
      { objectId: "tf-3", zoneId: "bin-false" },
    ],
  });
  assert.deepEqual(validatePack(p), []);
  const chip = resolveItem(p, p.items.length - 1).objects.find((o) => o.kind === "draggable")!;
  assert.equal(chip.size.w, 0.3, "sentence-long labels get the widest chip");
});

// --- Distractors. ---

test("gap distractors are shown as chips, accepted by no zone, and mixed in among the answers", () => {
  const pack = loadValidPack(demoRaw());
  const { objects } = resolveItem(pack, 1);
  const chipIds = objects.filter((o) => o.kind === "draggable").map((o) => o.id);
  assert.ok(chipIds.includes("must-to") && chipIds.includes("dont-must"));
  assert.ok(zonesOf(objects).every((z) => !z.accepts.includes("must-to") && !z.accepts.includes("dont-must")));
  assert.notDeepEqual(chipIds.slice(-2).sort(), ["dont-must", "must-to"], "distractors aren't parked at the end");
  assert.deepEqual(resolveItem(pack, 1).objects.map((o) => o.id), objects.map((o) => o.id), "same order every time");
});

test("rejects a gap activity without at least two distractors", () => {
  const p = demo();
  p.items[1].distractors = ["must-to"];
  expectProblem(p, /needs at least two distractors/);
});

test("rejects a distractor that is also an answer, or reads the same as one", () => {
  const p = demo();
  p.items[1].distractors = ["must-to", "must"];
  expectProblem(p, /both an answer and a distractor/);
  const q = demo();
  q.draggables.push({ id: "must-3", label: "Must" });
  q.items[1].distractors = ["must-to", "must-3"];
  expectProblem(q, /reads the same as a correct answer/);
});

test("rejects an unknown distractor, and distractors on a sort", () => {
  const p = demo();
  p.items[1].distractors = ["must-to", "ghost"];
  expectProblem(p, /unknown distractor "ghost"/);
  const q = demo();
  q.items[0].distractors = ["must-to"];
  expectProblem(q, /sort activity and can't have distractors/);
});

test("distractors count towards the 8-object limit", () => {
  const p = demo();
  for (let i = 0; i < 5; i++) p.draggables.push({ id: `wrong-${i}`, label: `wrong ${i}` });
  p.items[1].distractors = ["must-to", "dont-must", ...[0, 1, 2, 3, 4].map((i) => `wrong-${i}`)];
  expectProblem(p, /at most 8/);
});

test("binCapacity counts a grid of chips", () => {
  assert.deepEqual(binCapacity({ w: 0.45, h: 0.49 }, { w: 0.2, h: 0.08 }), { cols: 2, rows: 4 });
});
