import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyStarPart } from "./starClassifier";

test("classifies a situation-setting sentence", () => {
  assert.equal(classifyStarPart("At my previous job, there was a situation where our biggest client threatened to leave."), "situation");
});

test("classifies a task sentence", () => {
  assert.equal(classifyStarPart("My task was to win back their trust within a month."), "task");
});

test("classifies an action sentence", () => {
  assert.equal(classifyStarPart("So I decided to set up a weekly call with their team directly."), "action");
});

test("classifies a result sentence", () => {
  assert.equal(classifyStarPart("As a result, we kept the account and expanded it the following year."), "result");
});

test("returns null for a sentence with no signal", () => {
  assert.equal(classifyStarPart("The weather was nice that day."), null);
});

test("returns null rather than guessing on a genuine tie", () => {
  // Fires both "my task was" (task) and "so i decided" (action) — a tie.
  assert.equal(classifyStarPart("My task was difficult, so I decided to just wing it."), null);
});
