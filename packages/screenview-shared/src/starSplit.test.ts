import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { splitTranscriptByElement } from "./starSplit";

const fixturePath = fileURLToPath(new URL("./fixtures/starSplit.fixture.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

test("splits a transcript into its four STAR parts, matching the committed fixture", () => {
  const result = splitTranscriptByElement(fixture.transcript, fixture.covered);
  assert.deepEqual(result, fixture.expected);
});

test("always returns exactly four parts, in situation/task/action/result order", () => {
  const covered = {
    situation: { covered: true, seconds: 10 },
    task: { covered: true, seconds: 10 },
    action: { covered: true, seconds: 10 },
    result: { covered: true, seconds: 10 },
  };
  const result = splitTranscriptByElement("Just one sentence with no signal at all.", covered);
  assert.deepEqual(result.map((r) => r.part), ["situation", "task", "action", "result"]);
});

test("a short covered element is marked thin", () => {
  const covered = {
    situation: { covered: true, seconds: 40 },
    task: { covered: true, seconds: 20 },
    action: { covered: true, seconds: 15 },
    result: { covered: true, seconds: 8 },
  };
  const result = splitTranscriptByElement("As a result, we cut costs.", covered);
  const resultPart = result.find((r) => r.part === "result")!;
  assert.equal(resultPart.thin, true);
  const situationPart = result.find((r) => r.part === "situation")!;
  assert.equal(situationPart.thin, false);
});

test("an uncovered element is neither thin nor carrying text, just missing", () => {
  const covered = {
    situation: { covered: true, seconds: 10 },
    task: { covered: true, seconds: 10 },
    action: { covered: true, seconds: 10 },
    result: { covered: false, seconds: 0 },
  };
  const result = splitTranscriptByElement("I did the work myself.", covered);
  const resultPart = result.find((r) => r.part === "result")!;
  assert.equal(resultPart.covered, false);
  assert.equal(resultPart.thin, false);
});
