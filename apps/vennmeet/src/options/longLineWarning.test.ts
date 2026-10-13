import { test } from "node:test";
import assert from "node:assert/strict";
import { isLongLine } from "./longLineWarning";

test("eight words or fewer is not long", () => {
  assert.equal(isLongLine("What was the hardest moment in that project"), false); // 8 words
});

test("nine words is long", () => {
  assert.equal(isLongLine("What was really the hardest moment in that whole project"), true); // 9 words
});

test("warns, never blocks — it's just a boolean, callers decide what to do with it", () => {
  assert.equal(typeof isLongLine("anything"), "boolean");
});
