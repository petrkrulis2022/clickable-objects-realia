import { test } from "node:test";
import assert from "node:assert/strict";
import { fadeLevelForSession, notesForStarPart } from "./fade";

test("fade level matches the SPEC's table by session number", () => {
  assert.equal(fadeLevelForSession(1), "notes");
  assert.equal(fadeLevelForSession(2), "short-notes");
  assert.equal(fadeLevelForSession(3), "outlines");
  assert.equal(fadeLevelForSession(4), "after-only");
  assert.equal(fadeLevelForSession(5), "none");
  assert.equal(fadeLevelForSession(6), "none"); // stays off, doesn't come back
});

const story = {
  situation: "A major client threatened to leave because of a missed deadline.",
  task: "",
  action: "",
  result: "",
};

test("session 1 ('notes') shows the full story text", () => {
  assert.equal(notesForStarPart("notes", story, "situation"), story.situation);
});

test("session 2 ('short-notes') shortens to a few words", () => {
  const short = notesForStarPart("short-notes", story, "situation");
  assert.ok(short.split(/\s+/).length <= 5); // 4 words + ellipsis marker
  assert.ok(story.situation.startsWith(short.replace("…", "").trim()));
});

test("session 3 ('outlines') shows nothing — just the shape", () => {
  assert.equal(notesForStarPart("outlines", story, "situation"), "");
});

test("sessions 4 and 5 show nothing before the answer", () => {
  assert.equal(notesForStarPart("after-only", story, "situation"), "");
  assert.equal(notesForStarPart("none", story, "situation"), "");
});

test("no linked story at all shows nothing, regardless of fade level", () => {
  assert.equal(notesForStarPart("notes", null, "situation"), "");
});
