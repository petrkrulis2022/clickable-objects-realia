import { test } from "node:test";
import assert from "node:assert/strict";
import type { LessonPack } from "@realia/shared";
import { createNullLlmClient } from "./llm.js";
import { draftRealiaPlan, parseRealiaDraft } from "./realiaPlan.js";

function referencePack(): LessonPack {
  return {
    id: "test-pack",
    title: "Test pack",
    translationLang: "cs",
    scenery: [{ id: "table", label: "table", pos: { x: 0, y: 0 }, size: { w: 0.1, h: 0.1 } }],
    draggables: [
      { id: "keys", label: "keys" },
      { id: "ball", label: "ball" },
    ],
    zones: [
      { id: "on_table", anchor: "table", relation: "on", offset: { x: 0, y: 0 } },
      { id: "under_table", anchor: "table", relation: "under", offset: { x: 0, y: 0 } },
    ],
    backdrops: { livingroom: { src: "backdrops/livingroom.jpg", fit: "cover" } },
    sentenceTemplate: "The {object} is {relation} the {anchor}.",
    cards: [],
    items: [],
  };
}

test("parses a well-formed draft, keeping only valid items", () => {
  const draft = parseRealiaDraft(
    JSON.stringify({
      summary: "Focuses on under/on this week.",
      items: [
        { prompt: "Put the keys on the table.", object: "keys", zone: "on_table" },
        { prompt: "Put the ball under the table.", object: "ball", zone: "under_table", backdrop: "livingroom" },
        { prompt: "x", object: "keys", zone: "under_table" },
        { prompt: "y", object: "keys", zone: "under_table" },
      ],
    }),
    referencePack(),
  );
  assert.equal(draft.items.length, 4);
  assert.equal(draft.summary, "Focuses on under/on this week.");
});

test("drops an item referencing an object id that doesn't exist in the reference pack", () => {
  const draft = parseRealiaDraft(
    JSON.stringify({
      summary: "s",
      items: [
        { prompt: "Put the phone on the table.", object: "phone", zone: "on_table" }, // "phone" doesn't exist here
        { prompt: "a", object: "keys", zone: "on_table" },
        { prompt: "b", object: "ball", zone: "under_table" },
        { prompt: "c", object: "keys", zone: "under_table" },
        { prompt: "d", object: "ball", zone: "on_table" },
      ],
    }),
    referencePack(),
  );
  assert.equal(draft.items.length, 4);
  assert.ok(!draft.items.some((i) => i.object === "phone"));
});

test("drops an item referencing a zone id that doesn't exist", () => {
  const draft = parseRealiaDraft(
    JSON.stringify({
      summary: "s",
      items: [
        { prompt: "a", object: "keys", zone: "behind_sofa" }, // doesn't exist
        { prompt: "b", object: "keys", zone: "on_table" },
        { prompt: "c", object: "ball", zone: "under_table" },
        { prompt: "d", object: "keys", zone: "under_table" },
        { prompt: "e", object: "ball", zone: "on_table" },
      ],
    }),
    referencePack(),
  );
  assert.equal(draft.items.length, 4);
});

test("drops an unknown backdrop key but keeps the item (backdrop is optional)", () => {
  const draft = parseRealiaDraft(
    JSON.stringify({
      summary: "s",
      items: [
        { prompt: "a", object: "keys", zone: "on_table", backdrop: "nonexistent-backdrop" },
        { prompt: "b", object: "ball", zone: "under_table" },
        { prompt: "c", object: "keys", zone: "under_table" },
        { prompt: "d", object: "ball", zone: "on_table" },
      ],
    }),
    referencePack(),
  );
  assert.equal(draft.items.length, 4);
  assert.equal(draft.items[0].backdrop, undefined);
});

test("throws if fewer than the minimum number of valid items survive validation", () => {
  assert.throws(() =>
    parseRealiaDraft(
      JSON.stringify({ summary: "s", items: [{ prompt: "a", object: "keys", zone: "on_table" }] }),
      referencePack(),
    ),
  );
});

test("throws on malformed JSON", () => {
  assert.throws(() => parseRealiaDraft("not json", referencePack()));
});

test("draftRealiaPlan wires the LLM client's response through parsing end to end", async () => {
  const llm = createNullLlmClient(
    JSON.stringify({
      summary: "s",
      items: [
        { prompt: "a", object: "keys", zone: "on_table" },
        { prompt: "b", object: "ball", zone: "under_table" },
        { prompt: "c", object: "keys", zone: "under_table" },
        { prompt: "d", object: "ball", zone: "on_table" },
      ],
    }),
  );
  const draft = await draftRealiaPlan({ referencePack: referencePack(), materials: [] }, llm);
  assert.equal(draft.items.length, 4);
});
