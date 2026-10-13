import { test } from "node:test";
import assert from "node:assert/strict";
import type { Answer, Role, Session } from "@screenview/shared";
import { computeSessionSummary, nextSessionNumber } from "./sessionStore";
import { generateQuestionBank } from "./questions";

function role(): Role {
  return {
    id: "r1",
    title: "PM",
    company: "Acme",
    jobDescription: "",
    competencies: [
      { id: "c1", name: "stakeholder management", sourcePhrase: "stakeholder management", storyIds: ["s1"] },
      { id: "c2", name: "agile", sourcePhrase: "agile", storyIds: [] }, // still a gap
    ],
    stories: [],
  };
}

function answerFor(r: Role, competencyId: string, overrides: Partial<Answer> = {}): Answer {
  const bank = generateQuestionBank(r);
  const question = bank.find((q) => q.competencyId === competencyId)!;
  return {
    questionId: question.id,
    attempt: 1,
    transcript: "",
    covered: {
      situation: { covered: true, seconds: 10 },
      task: { covered: true, seconds: 10 },
      action: { covered: true, seconds: 10 },
      result: { covered: true, seconds: 10 },
    },
    fillerCount: 0,
    totalSeconds: 40,
    ...overrides,
  };
}

test("nextSessionNumber starts at 1 and increments past the highest existing", () => {
  assert.equal(nextSessionNumber([]), 1);
  const sessions: Session[] = [{ id: "a", roleId: "r1", number: 1, startedAt: "", answers: [] }];
  assert.equal(nextSessionNumber(sessions), 2);
});

test("competenciesPracticed names only competencies that exist on the map", () => {
  const r = role();
  const session: Session = { id: "s1", roleId: r.id, number: 1, startedAt: "", answers: [answerFor(r, "c1")] };
  const summary = computeSessionSummary(session, r);
  const validNames = new Set(r.competencies.map((c) => c.name));
  for (const name of [...summary.competenciesPracticed, ...summary.ranLong, ...summary.stillUncovered]) {
    assert.ok(validNames.has(name), `"${name}" is not a competency on the map`);
  }
  assert.deepEqual(summary.competenciesPracticed, ["stakeholder management"]);
});

test("stillUncovered lists every competency with no linked story", () => {
  const r = role();
  const session: Session = { id: "s1", roleId: r.id, number: 1, startedAt: "", answers: [] };
  const summary = computeSessionSummary(session, r);
  assert.deepEqual(summary.stillUncovered, ["agile"]);
});

test("an answer that runs much longer than the others is flagged as ranLong", () => {
  const r = role();
  const session: Session = {
    id: "s1",
    roleId: r.id,
    number: 1,
    startedAt: "",
    answers: [answerFor(r, "c1", { totalSeconds: 30 }), answerFor(r, "c2", { totalSeconds: 120 })],
  };
  const summary = computeSessionSummary(session, r);
  assert.deepEqual(summary.ranLong, ["agile"]);
});

test("filler trend is 'not-enough-data' with fewer than two answers", () => {
  const r = role();
  const session: Session = { id: "s1", roleId: r.id, number: 1, startedAt: "", answers: [answerFor(r, "c1")] };
  assert.equal(computeSessionSummary(session, r).fillerTrend, "not-enough-data");
});

test("filler trend is 'improving' when later answers have fewer fillers", () => {
  const r = role();
  const session: Session = {
    id: "s1",
    roleId: r.id,
    number: 1,
    startedAt: "",
    answers: [
      answerFor(r, "c1", { fillerCount: 10 }),
      answerFor(r, "c1", { attempt: 2, fillerCount: 2 }),
    ],
  };
  assert.equal(computeSessionSummary(session, r).fillerTrend, "improving");
});
