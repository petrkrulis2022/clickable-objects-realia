import { test } from "node:test";
import assert from "node:assert/strict";
import { AnswerSession } from "./session.js";

function makeQuestion() {
  return {
    id: "q1",
    text: "Tell me about a time you demonstrated stakeholder management.",
    competencyId: "c1",
    probes: ["probe-a", "probe-b", "probe-c"],
  };
}

function makeRole() {
  return { id: "r1", title: "PM", competencies: [] };
}

test("a classified delta marks its STAR part covered", () => {
  let clock = 0;
  const session = new AnswerSession({ role: makeRole(), question: makeQuestion(), now: () => clock });
  clock += 5000;
  const result = session.handleTranscriptDelta("At my previous job, there was a situation where a client was upset.");
  assert.equal(result.part, "situation");
  assert.ok(result.seconds > 0);
  assert.equal(session.feedback().covered.situation.covered, true);
});

test("an unclassifiable delta still counts fillers and elapsed time, but marks no part", () => {
  let clock = 0;
  const session = new AnswerSession({ role: makeRole(), question: makeQuestion(), now: () => clock });
  clock += 2000;
  const result = session.handleTranscriptDelta("Um, so, like, it was a normal day.");
  assert.equal(result.part, null);
  assert.equal(result.fillerDelta, 2); // "um" and "like"
});

test("filler count accumulates across deltas", () => {
  const session = new AnswerSession({ role: makeRole(), question: makeQuestion() });
  session.handleTranscriptDelta("Um, I started.");
  session.handleTranscriptDelta("Like, it went fine.");
  assert.equal(session.feedback().fillerCount, 2);
});

test("seconds accumulate on repeated deltas for the same part", () => {
  let clock = 0;
  const session = new AnswerSession({ role: makeRole(), question: makeQuestion(), now: () => clock });
  clock += 3000;
  session.handleTranscriptDelta("So I decided to set up a weekly call.");
  clock += 4000;
  const second = session.handleTranscriptDelta("I reached out to their lead directly.");
  assert.equal(second.part, "action");
  assert.ok(second.seconds >= 4, `expected accumulated seconds >= 4, got ${second.seconds}`);
});

test("decideProbeIndex returns null on a second call — exactly one probe per answer", () => {
  const session = new AnswerSession({ role: makeRole(), question: makeQuestion() });
  session.handleTranscriptDelta("We worked on it together as a team.");
  const first = session.decideProbeIndex();
  assert.notEqual(first, null);
  const second = session.decideProbeIndex();
  assert.equal(second, null);
});

test("a complete, 'I'-centred answer draws no probe", () => {
  const session = new AnswerSession({ role: makeRole(), question: makeQuestion() });
  session.handleTranscriptDelta("At my previous job, there was a situation where a client was upset.");
  session.handleTranscriptDelta("My task was to fix it within a week.");
  session.handleTranscriptDelta("So I decided to call them personally every day.");
  session.handleTranscriptDelta("As a result, we kept the account and I got a bonus.");
  assert.equal(session.decideProbeIndex(), null);
});

test("feedback().covered always has all four STAR parts, even untouched", () => {
  const session = new AnswerSession({ role: makeRole(), question: makeQuestion() });
  const covered = session.feedback().covered;
  assert.deepEqual(Object.keys(covered).sort(), ["action", "result", "situation", "task"]);
});

test("getTranscript returns exactly what was streamed, nothing added", () => {
  const session = new AnswerSession({ role: makeRole(), question: makeQuestion() });
  session.handleTranscriptDelta("Hello");
  session.handleTranscriptDelta("world");
  assert.equal(session.getTranscript(), "Hello world");
});
