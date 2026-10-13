import { test } from "node:test";
import assert from "node:assert/strict";
import type { PracticeServerMessage } from "@screenview/shared";
import { AnswerSession } from "./session.js";
import { handleClientMessage, speakQuestion, SessionStore } from "./server.js";
import { createNullTranscribeAdapter } from "./scribeAdapter.js";
import { createNullVoiceAgentAdapter } from "./agentAdapter.js";

function makeSession() {
  return new AnswerSession({
    role: { id: "r1", title: "PM", competencies: [] },
    question: { id: "q1", text: "Tell me about stakeholder management.", competencyId: "c1", probes: ["a", "b", "c"] },
  });
}

function collector() {
  const messages: PracticeServerMessage[] = [];
  return { send: (m: PracticeServerMessage) => messages.push(m), messages };
}

test("speakQuestion sends the fixed question text, nothing else", async () => {
  const session = makeSession();
  const { send, messages } = collector();
  await speakQuestion(session, { scribe: createNullTranscribeAdapter(), agent: createNullVoiceAgentAdapter() }, send);
  assert.deepEqual(messages, [{ type: "agent-speaking", text: session.question.text }]);
});

test("an audio-chunk that transcribes to nothing sends nothing", async () => {
  const session = makeSession();
  const { send, messages } = collector();
  const deps = { scribe: createNullTranscribeAdapter(), agent: createNullVoiceAgentAdapter() };
  await handleClientMessage(session, { type: "audio-chunk", base64: "irrelevant" }, deps, send);
  assert.deepEqual(messages, []);
});

test("an audio-chunk that transcribes sends transcript-delta and star-covered", async () => {
  const session = makeSession();
  const { send, messages } = collector();
  const deps = {
    scribe: { transcribeChunk: async () => "So I decided to call the client personally." },
    agent: createNullVoiceAgentAdapter(),
  };
  await handleClientMessage(session, { type: "audio-chunk", base64: "x" }, deps, send);
  assert.equal(messages[0].type, "transcript-delta");
  assert.equal(messages.some((m) => m.type === "star-covered" && m.part === "action"), true);
});

test("answer-ended on a thin 'we'-heavy answer sends a probe and agent-speaking, no feedback yet", async () => {
  const session = makeSession();
  session.handleTranscriptDelta("We worked on it together as a team.");
  const { send, messages } = collector();
  const deps = { scribe: createNullTranscribeAdapter(), agent: createNullVoiceAgentAdapter() };
  await handleClientMessage(session, { type: "answer-ended" }, deps, send);
  assert.equal(messages.some((m) => m.type === "probe"), true);
  assert.equal(messages.some((m) => m.type === "agent-speaking"), true);
  assert.equal(messages.some((m) => m.type === "feedback"), false);
});

test("a second answer-ended after a probe sends feedback, not another probe", async () => {
  const session = makeSession();
  session.handleTranscriptDelta("We worked on it together as a team.");
  const deps = { scribe: createNullTranscribeAdapter(), agent: createNullVoiceAgentAdapter() };
  const first = collector();
  await handleClientMessage(session, { type: "answer-ended" }, deps, first.send);
  assert.equal(first.messages.some((m) => m.type === "probe"), true);

  const second = collector();
  await handleClientMessage(session, { type: "answer-ended" }, deps, second.send);
  assert.equal(second.messages.some((m) => m.type === "probe"), false);
  assert.equal(second.messages.some((m) => m.type === "feedback"), true);
});

test("answer-ended on a complete answer sends feedback directly, no probe", async () => {
  const session = makeSession();
  session.handleTranscriptDelta("At my previous job, there was a situation where a client was upset.");
  session.handleTranscriptDelta("My task was to fix it within a week.");
  session.handleTranscriptDelta("So I decided to call them personally every day.");
  session.handleTranscriptDelta("As a result, we kept the account and I got a bonus.");
  const { send, messages } = collector();
  const deps = { scribe: createNullTranscribeAdapter(), agent: createNullVoiceAgentAdapter() };
  await handleClientMessage(session, { type: "answer-ended" }, deps, send);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, "feedback");
});

test("SessionStore scopes a session to its token and forgets it on end", () => {
  const store = new SessionStore();
  const { sessionToken } = store.start({
    role: { id: "r1", title: "PM", competencies: [] },
    question: { id: "q1", text: "Q", competencyId: "c1", probes: [] },
  });
  assert.ok(store.get(sessionToken) instanceof AnswerSession);
  store.end(sessionToken);
  assert.equal(store.get(sessionToken), undefined);
});
