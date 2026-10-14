import { test } from "node:test";
import assert from "node:assert/strict";
import { createNullLlmClient } from "./llm.js";
import { draftVennPlan, parseVennDraft } from "./vennPlan.js";

test("parses a well-formed draft into real Section/Card objects with ids", () => {
  const draft = parseVennDraft(
    JSON.stringify({
      name: "Acme follow-up",
      sections: [
        {
          title: "Goal",
          cards: [{ kind: "goal", title: "This call", want: "Agree phase 2 scope", walkAway: "No agreement by Friday" }],
        },
      ],
    }),
  );
  assert.equal(draft.name, "Acme follow-up");
  assert.equal(draft.sections.length, 1);
  assert.ok(draft.sections[0].id);
  assert.ok(draft.sections[0].cards[0].id);
  assert.equal(draft.sections[0].cards[0].kind, "goal");
});

test("strips a markdown code fence around the JSON", () => {
  const draft = parseVennDraft("```json\n" + JSON.stringify({ name: "X", sections: [] }) + "\n```");
  assert.equal(draft.name, "X");
});

test("clamps to at most 6 sections and 6 cards per section", () => {
  const manySections = Array.from({ length: 10 }, (_, i) => ({
    title: `Section ${i}`,
    cards: Array.from({ length: 10 }, () => ({ kind: "phrase", text: "x" })),
  }));
  const draft = parseVennDraft(JSON.stringify({ name: "X", sections: manySections }));
  assert.equal(draft.sections.length, 6);
  for (const s of draft.sections) assert.ok(s.cards.length <= 6);
});

test("drops a card of an invented or forbidden kind (decision/action are shared-layer only)", () => {
  const draft = parseVennDraft(
    JSON.stringify({
      name: "X",
      sections: [
        {
          title: "S",
          cards: [
            { kind: "phrase", text: "kept" },
            { kind: "decision", text: "not allowed in a draft", agreedBy: "nobody", at: "now" },
            { kind: "made-up-kind", text: "also dropped" },
          ],
        },
      ],
    }),
  );
  assert.equal(draft.sections[0].cards.length, 1);
  assert.equal(draft.sections[0].cards[0].kind, "phrase");
});

test("throws on malformed JSON rather than silently producing a broken deck", () => {
  assert.throws(() => parseVennDraft("not json at all"));
});

test("throws when the top-level shape is wrong", () => {
  assert.throws(() => parseVennDraft(JSON.stringify({ wrong: "shape" })));
});

test("draftVennPlan wires the LLM client's response through parsing end to end", async () => {
  const llm = createNullLlmClient(JSON.stringify({ name: "From LLM", sections: [] }));
  const draft = await draftVennPlan({ materials: [] }, llm);
  assert.equal(draft.name, "From LLM");
});
