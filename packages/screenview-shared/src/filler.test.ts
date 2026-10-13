import { test } from "node:test";
import assert from "node:assert/strict";
import { countFillers } from "./filler";

test("counts each of the four named fillers", () => {
  assert.equal(countFillers("Um, so, like, you know, it was sort of a mess."), 4);
});

test("counts repeats of the same filler", () => {
  assert.equal(countFillers("like like like"), 3);
});

test("a clean sentence counts zero", () => {
  assert.equal(countFillers("I led the migration and shipped it on time."), 0);
});

test("is case-insensitive", () => {
  assert.equal(countFillers("UM, LIKE, YOU KNOW."), 3);
});

test("matches on word boundaries, not substrings", () => {
  // "likely" and "sortof" (no space) must not count as "like"/"sort of".
  assert.equal(countFillers("It's likely that a sortof-decent plan works."), 0);
});
