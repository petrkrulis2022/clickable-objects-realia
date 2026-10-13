import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCompetencies } from "./competencyParser";

const JD = `
We're looking for a Senior Product Manager with strong stakeholder management
skills and a track record of shipping under deadline. You'll work in a
cross-functional team and need to be comfortable working with ambiguity.
Experience with agile processes is a plus.
`;

test("every competency traces to a real phrase that literally appears in the JD", () => {
  const competencies = parseCompetencies(JD);
  assert.ok(competencies.length > 0);
  for (const c of competencies) {
    assert.ok(
      JD.toLowerCase().includes(c.sourcePhrase.toLowerCase()),
      `sourcePhrase "${c.sourcePhrase}" does not appear in the JD`,
    );
  }
});

test("finds the phrases that are actually present", () => {
  const competencies = parseCompetencies(JD);
  const names = competencies.map((c) => c.name.toLowerCase());
  assert.ok(names.includes("stakeholder management"));
  assert.ok(names.includes("shipping under deadline"));
  assert.ok(names.includes("cross-functional"));
  assert.ok(names.includes("working with ambiguity"));
  assert.ok(names.includes("agile"));
});

test("never invents a competency the role 'usually' needs but that isn't in the text", () => {
  const competencies = parseCompetencies(JD);
  const names = competencies.map((c) => c.name.toLowerCase());
  // None of these appear in the JD above — a real interview-prep tool
  // might plausibly guess a PM role wants these, but guessing is
  // exactly what this function must never do.
  assert.ok(!names.includes("budget management"));
  assert.ok(!names.includes("hiring"));
  assert.ok(!names.includes("negotiation"));
});

test("an empty or unrelated JD produces no competencies, not invented ones", () => {
  assert.deepEqual(parseCompetencies(""), []);
  assert.deepEqual(parseCompetencies("The quick brown fox jumps over the lazy dog."), []);
});

test("every competency starts with no linked stories (a gap until linked)", () => {
  const competencies = parseCompetencies(JD);
  for (const c of competencies) assert.deepEqual(c.storyIds, []);
});
