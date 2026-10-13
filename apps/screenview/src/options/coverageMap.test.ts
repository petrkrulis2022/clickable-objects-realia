import { test } from "node:test";
import assert from "node:assert/strict";
import type { Competency } from "@screenview/shared";
import { mergeCompetencies } from "./coverageMap";

test("re-parsing the JD keeps the id and storyIds of a competency already linked", () => {
  const existing: Competency[] = [{ id: "old-id", name: "agile", sourcePhrase: "agile", storyIds: ["story-1"] }];
  const parsed: Competency[] = [{ id: "fresh-id", name: "agile", sourcePhrase: "agile", storyIds: [] }];
  const merged = mergeCompetencies(existing, parsed);
  assert.equal(merged[0].id, "old-id");
  assert.deepEqual(merged[0].storyIds, ["story-1"]);
});

test("a newly-appearing phrase in the JD gets a fresh id and no links", () => {
  const existing: Competency[] = [];
  const parsed: Competency[] = [{ id: "fresh-id", name: "agile", sourcePhrase: "agile", storyIds: [] }];
  const merged = mergeCompetencies(existing, parsed);
  assert.equal(merged[0].id, "fresh-id");
  assert.deepEqual(merged[0].storyIds, []);
});

test("a competency dropped from the JD on re-parse disappears, taking its links with it", () => {
  const existing: Competency[] = [{ id: "old-id", name: "agile", sourcePhrase: "agile", storyIds: ["story-1"] }];
  const parsed: Competency[] = []; // JD no longer mentions it
  const merged = mergeCompetencies(existing, parsed);
  assert.deepEqual(merged, []);
});

test("matching is case-insensitive on sourcePhrase", () => {
  const existing: Competency[] = [{ id: "old-id", name: "Agile", sourcePhrase: "Agile", storyIds: ["story-1"] }];
  const parsed: Competency[] = [{ id: "fresh-id", name: "agile", sourcePhrase: "agile", storyIds: [] }];
  const merged = mergeCompetencies(existing, parsed);
  assert.equal(merged[0].id, "old-id");
  assert.deepEqual(merged[0].storyIds, ["story-1"]);
});
