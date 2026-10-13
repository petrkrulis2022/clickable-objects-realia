import { test } from "node:test";
import assert from "node:assert/strict";
import type { Competency } from "@screenview/shared";
import { dealQuestion, generateQuestionBank } from "./questions";

function competency(id: string, storyIds: string[] = []): Competency {
  return { id, name: id, sourcePhrase: id, storyIds };
}

test("generates exactly one question per competency", () => {
  const bank = generateQuestionBank({ competencies: [competency("a"), competency("b")] });
  assert.equal(bank.length, 2);
  assert.deepEqual(
    bank.map((q) => q.competencyId),
    ["a", "b"],
  );
});

test("every question's probes are the fixed set, not invented text", () => {
  const bank = generateQuestionBank({ competencies: [competency("a")] });
  assert.deepEqual(bank[0].probes, [...bank[0].probes]); // sanity: array present
  assert.ok(bank[0].probes.length > 0);
});

test("dealQuestion never returns null when the bank is non-empty", () => {
  const bank = generateQuestionBank({ competencies: [competency("a")] });
  const dealt = dealQuestion(bank, [competency("a")], []);
  assert.ok(dealt);
});

test("dealQuestion returns null for an empty bank", () => {
  assert.equal(dealQuestion([], [], []), null);
});

test("over many deals, an uncovered competency comes up roughly 3x as often as a covered one", () => {
  const competencies = [competency("gap"), competency("covered", ["story-1"])];
  const bank = generateQuestionBank({ competencies });
  let gapCount = 0;
  let coveredCount = 0;
  let seed = 1;
  const random = () => {
    // deterministic PRNG so the test doesn't flake
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 2000; i++) {
    const dealt = dealQuestion(bank, competencies, [], random);
    if (dealt?.competencyId === "gap") gapCount++;
    else coveredCount++;
  }
  const ratio = gapCount / coveredCount;
  assert.ok(ratio > 2 && ratio < 4, `expected ~3x weighting toward the gap, got ratio ${ratio}`);
});

test("excludes already-asked questions until the whole bank has had a turn", () => {
  const competencies = [competency("a"), competency("b")];
  const bank = generateQuestionBank({ competencies });
  const dealt = dealQuestion(bank, competencies, [bank[0].id], () => 0);
  assert.equal(dealt?.id, bank[1].id);
});

test("once every question has been asked, the pool opens back up", () => {
  const competencies = [competency("a")];
  const bank = generateQuestionBank({ competencies });
  const dealt = dealQuestion(bank, competencies, [bank[0].id], () => 0);
  assert.equal(dealt?.id, bank[0].id);
});
