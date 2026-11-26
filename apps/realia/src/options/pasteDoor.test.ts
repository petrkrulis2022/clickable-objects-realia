import { test } from "node:test";
import assert from "node:assert/strict";
import { loadValidPack, resolveItem, teacherLesson } from "@realia/shared";
import { compilePaste, parsePaste, pickAnswer, unansweredGaps, type PasteDraft } from "./pasteDoor";

// Written for the tests, not copied from any coursebook.
const SPEC_EXAMPLE = `1. You ___ take a calculator into the exam.
2. You ___ get ready to go.
3. She ___ eat crisps and chocolate.
---
shouldn't | 'd better | ought to | should | must to | don't must`;

const NINE_MARKED = `1. You [mustn't] use your phone in the exam room.
2. You [don't have to] wear a tie on Fridays.
3. Students [must] be in class by half past eight.
4. You [can't] leave before the bell, it's against the rules.
5. We [have to] hand in the project next Monday.
6. You [shouldn't] stay up so late before a test.
7. You ['d better] hurry, the bus is leaving.
8. They [ought to] apologise to the teacher.
9. You [can] borrow my dictionary if you like.
---
mustn't | don't have to | must | can't | have to | shouldn't
'd better | ought to | can | must to | don't must | needn't to`;

const opts = { packId: "lesson-20261126-test01", translationLang: "Czech" };

function ok(input: string): PasteDraft {
  const r = parsePaste(input);
  if (!r.ok) assert.fail(`expected a clean parse, got: ${r.errors.join(" | ")}`);
  return r.draft;
}

function errorsOf(input: string): string[] {
  const r = parsePaste(input);
  assert.equal(r.ok, false, "expected the paste to be refused");
  return r.ok ? [] : r.errors;
}

/** No model call and no network request of any kind: any fetch fails the test. */
function withNoNetwork<T>(fn: () => T): T {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("the paste door made a network request");
  }) as typeof fetch;
  try {
    return fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("acceptance: nine marked sentences and a twelve-entry bank become a playable pack, fast, with no network", () => {
  const started = performance.now();
  const result = withNoNetwork(() => {
    const draft = ok(NINE_MARKED);
    return compilePaste(draft, opts);
  });
  const ms = performance.now() - started;
  assert.ok(result.ok, result.ok ? "" : result.errors.join(" | "));
  assert.ok(ms < 5000, `took ${ms}ms`);
  const pack = loadValidPack(result.pack); // what the relay will load
  assert.equal(pack.items.length, 9);
  assert.ok(pack.items.every((i) => i.kind === "gap"));
  pack.items.forEach((_, i) => resolveItem(pack, i)); // every item lays out
});

test("acceptance: the sentence text is character-identical to what was pasted (only the gap becomes its marker)", () => {
  const result = compilePaste(ok(NINE_MARKED), opts);
  assert.ok(result.ok);
  const pasted = NINE_MARKED.split("\n").slice(0, 9).map((l) => l.replace(/^\d+\.\s+/, ""));
  result.pack.items.forEach((item, i) => {
    const bracket = pasted[i].match(/\[[^\]]*\]/)![0];
    assert.equal(item.prompt.replace("[1]", bracket), pasted[i]);
  });
});

test("acceptance: bank entries that fit no gap arrive as distractors, before the other sentences' answers", () => {
  const result = compilePaste(ok(NINE_MARKED), opts);
  assert.ok(result.ok);
  const labelOf = new Map(result.pack.draggables.map((d) => [d.id, d.label]));
  for (const item of result.pack.items) {
    const wrong = (item.distractors ?? []).map((d) => labelOf.get(d));
    assert.deepEqual(wrong.slice(0, 3), ["must to", "don't must", "needn't to"]);
    assert.ok(wrong.length >= 2 && wrong.length + 1 <= 8, "answers plus distractors fit the 8-chip cap");
  }
});

test("unmarked paste: nothing is inferred; the teacher picks each gap, one tap each, then it compiles", () => {
  let draft = ok(SPEC_EXAMPLE);
  assert.equal(unansweredGaps(draft).length, 3);
  assert.equal(compilePaste(draft, opts).ok, false, "never compiles with a gap unanswered");
  draft = pickAnswer(draft, 0, 0, "shouldn't");
  draft = pickAnswer(draft, 1, 0, "'d better");
  draft = pickAnswer(draft, 2, 0, "shouldn't");
  assert.equal(unansweredGaps(draft).length, 0);
  const result = compilePaste(draft, opts);
  assert.ok(result.ok, result.ok ? "" : result.errors.join(" | "));
  assert.equal(result.pack.items[0].prompt, "You [1] take a calculator into the exam.");
});

test("an entry correct in two gaps gets a chip per gap; a gap may accept two entries — and neither is an error", () => {
  const draft = ok(`You [should | ought to] revise, and you [should] sleep.
---
should | ought to | must to | don't must`);
  const result = compilePaste(draft, opts);
  assert.ok(result.ok, result.ok ? "" : result.errors.join(" | "));
  const item = result.pack.items[0];
  const chips = new Set(item.pairs.map((p) => p.objectId));
  assert.equal([...chips].filter((id) => id.startsWith("w1")).length, 2, "'should' fills two gaps, so two chips");
  assert.deepEqual(teacherLesson(result.pack).items[0].key.sort(), ["ought to → [1]", "should → [1]", "should → [2]"]);
});

test("curly and straight apostrophes match; the chip keeps exactly what was typed in the bank", () => {
  const result = compilePaste(ok(`You [’d better] go now.
---
'd better | must to | don't must`), opts);
  assert.ok(result.ok);
  assert.ok(result.pack.draggables.some((d) => d.label === "'d better"));
  assert.equal(result.pack.items[0].prompt, "You [1] go now.");
});

// --- A malformed paste names the offending line and loads nothing. ---

test("refuses a paste with no --- line", () => {
  assert.match(errorsOf("You ___ go.\nmust | can")[0], /no --- line/);
});

test("refuses a second --- line, naming it", () => {
  assert.ok(errorsOf("You ___ go.\n---\nmust | can\n---\nshould").some((e) => /^Line 4: a second ---/.test(e)));
});

test("refuses a sentence with no gap, naming its line", () => {
  assert.ok(errorsOf("You ___ go.\nNo gap here.\n---\nmust | can | to | x").some((e) => /^Line 2 has no gap/.test(e)));
});

test("refuses an empty bank, an empty entry, and a duplicate entry", () => {
  assert.ok(errorsOf("You ___ go.\n---\n").some((e) => /word bank .* is empty/.test(e)));
  assert.ok(errorsOf("You ___ go.\n---\nmust || can").some((e) => /^Line 3: an empty entry/.test(e)));
  assert.ok(errorsOf("You ___ go.\n---\nmust | can | Must").some((e) => /^Line 3: "Must" is in the word bank twice/.test(e)));
});

test("refuses a bracketed answer that isn't in the bank", () => {
  assert.ok(errorsOf("You [ought to] go.\n---\nmust | can | should").some((e) => /^Line 1: "ought to" isn't in the word bank/.test(e)));
});

test("refuses brackets on some gaps but not others — no guessing", () => {
  const errors = errorsOf("You [must] go.\nYou ___ stay.\n---\nmust | can | x | y");
  assert.ok(errors.some((e) => /^Line 2: gap 1 has no answer in \[brackets\]/.test(e)));
});

test("refuses an unclosed bracket and an empty one", () => {
  assert.ok(errorsOf("You [must go.\n---\nmust | can").some((e) => /^Line 1: a \[ without its \]/.test(e)));
  assert.ok(errorsOf("You [] go.\n---\nmust | can").some((e) => /^Line 1: an empty \[ \]/.test(e)));
});

test("refuses to compile a sentence that would be solved by counting chips", () => {
  const draft = ok("You [must] go and you [can] stay.\n---\nmust | can");
  const result = compilePaste(draft, opts);
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.errors[0], /^Line 1 needs at least 2 entries .* wrong/);
});
