import { test } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@screenview/shared";
import { linkStoryToCompetency, newStory, unlinkStoryFromCompetency } from "./roles";

function emptyRole(): Role {
  return { id: "r1", title: "Role", company: "", jobDescription: "", competencies: [], stories: [] };
}

test("linking a normal story adds it to the competency's storyIds", () => {
  const story = newStory();
  const role: Role = { ...emptyRole(), stories: [story], competencies: [{ id: "c1", name: "x", sourcePhrase: "x", storyIds: [] }] };
  const linked = linkStoryToCompetency(role, story.id, "c1");
  assert.deepEqual(linked.competencies[0].storyIds, [story.id]);
});

test("a drafted story cannot be linked — linking is a no-op until it's edited", () => {
  const story = { ...newStory(), draftedByModel: true };
  const role: Role = { ...emptyRole(), stories: [story], competencies: [{ id: "c1", name: "x", sourcePhrase: "x", storyIds: [] }] };
  const linked = linkStoryToCompetency(role, story.id, "c1");
  assert.deepEqual(linked.competencies[0].storyIds, []);
});

test("once a drafted story is edited (draftedByModel: false), it links normally", () => {
  const story = newStory(); // draftedByModel: false — "edited" state
  const role: Role = { ...emptyRole(), stories: [story], competencies: [{ id: "c1", name: "x", sourcePhrase: "x", storyIds: [] }] };
  const linked = linkStoryToCompetency(role, story.id, "c1");
  assert.deepEqual(linked.competencies[0].storyIds, [story.id]);
});

test("one story can cover several competencies", () => {
  const story = newStory();
  const role: Role = {
    ...emptyRole(),
    stories: [story],
    competencies: [
      { id: "c1", name: "a", sourcePhrase: "a", storyIds: [] },
      { id: "c2", name: "b", sourcePhrase: "b", storyIds: [] },
    ],
  };
  const afterFirst = linkStoryToCompetency(role, story.id, "c1");
  const afterSecond = linkStoryToCompetency(afterFirst, story.id, "c2");
  assert.deepEqual(afterSecond.competencies[0].storyIds, [story.id]);
  assert.deepEqual(afterSecond.competencies[1].storyIds, [story.id]);
});

test("unlinking removes the story from that competency only", () => {
  const story = newStory();
  const role: Role = {
    ...emptyRole(),
    stories: [story],
    competencies: [
      { id: "c1", name: "a", sourcePhrase: "a", storyIds: [story.id] },
      { id: "c2", name: "b", sourcePhrase: "b", storyIds: [story.id] },
    ],
  };
  const after = unlinkStoryFromCompetency(role, story.id, "c1");
  assert.deepEqual(after.competencies[0].storyIds, []);
  assert.deepEqual(after.competencies[1].storyIds, [story.id]);
});

test("a new story always starts un-drafted and empty", () => {
  const story = newStory();
  assert.equal(story.draftedByModel, false);
  assert.equal(story.situation, "");
});
