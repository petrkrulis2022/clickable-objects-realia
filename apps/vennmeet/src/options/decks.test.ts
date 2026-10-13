import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecksFromTemplate, exportDeckJson, importDeckJson } from "./decks";
import { TEMPLATES } from "../templates/index";

test("all eight templates load", () => {
  assert.equal(TEMPLATES.length, 8);
  const ids = TEMPLATES.map((t) => t.id);
  assert.deepEqual(
    [...ids].sort(),
    [
      "blank",
      "client-meeting",
      "difficult-conversation",
      "negotiation",
      "one-to-one",
      "project-check-in",
      "sales-call",
      "second-language-meeting",
    ],
  );
});

test("a dual-layer template produces one deck per layer, sections split correctly", () => {
  const template = TEMPLATES.find((t) => t.id === "one-to-one")!;
  const decks = createDecksFromTemplate(template);
  assert.equal(decks.length, 2);
  const privateDeck = decks.find((d) => d.visibility === "private")!;
  const sharedDeck = decks.find((d) => d.visibility === "shared")!;
  assert.ok(privateDeck);
  assert.ok(sharedDeck);
  assert.equal(privateDeck.sections.length, 2); // "What I want to raise", "Things unsaid"
  assert.equal(sharedDeck.sections.length, 3); // "Agenda", "Decisions", "Actions"
});

test("a single-layer template produces exactly one deck", () => {
  const template = TEMPLATES.find((t) => t.id === "sales-call")!;
  const decks = createDecksFromTemplate(template);
  assert.equal(decks.length, 1);
  assert.equal(decks[0].visibility, "private");
});

test("blank's layersOverride controls which layer(s) it creates for ('chosen at start')", () => {
  const template = TEMPLATES.find((t) => t.id === "blank")!;
  assert.equal(createDecksFromTemplate(template, ["shared"])[0].visibility, "shared");
  assert.equal(createDecksFromTemplate(template, ["private", "shared"]).length, 2);
});

test("export then import is identical (content, not volatile ids/timestamps)", () => {
  const template = TEMPLATES.find((t) => t.id === "sales-call")!;
  const original = createDecksFromTemplate(template)[0];

  const json = exportDeckJson(original);
  const imported = importDeckJson(json);

  assert.equal(imported.name, original.name);
  assert.equal(imported.template, original.template);
  assert.equal(imported.visibility, original.visibility);
  assert.equal(imported.sections.length, original.sections.length);
  imported.sections.forEach((section, i) => {
    assert.equal(section.title, original.sections[i].title);
    assert.equal(section.cards.length, original.sections[i].cards.length);
    section.cards.forEach((card, j) => {
      const { id: _importedId, ...importedRest } = card;
      const { id: _originalId, ...originalRest } = original.sections[i].cards[j];
      assert.deepEqual(importedRest, originalRest);
    });
  });

  // Ids are regenerated so importing twice never collides with the original.
  assert.notEqual(imported.id, original.id);
});
