import { test } from "node:test";
import assert from "node:assert/strict";
import { decideProbe, FIXED_PROBES } from "./probes";
import type { StarPart } from "./index";

function covered(overrides: Partial<Record<StarPart, boolean>> = {}): Record<StarPart, { covered: boolean; seconds: number }> {
  const parts: StarPart[] = ["situation", "task", "action", "result"];
  const out = {} as Record<StarPart, { covered: boolean; seconds: number }>;
  for (const p of parts) out[p] = { covered: overrides[p] ?? true, seconds: 20 };
  return out;
}

test("a fully covered, 'I'-centred answer draws no probe", () => {
  const transcript = "I led the project and I delivered it myself.";
  assert.equal(decideProbe(covered(), transcript), null);
});

test("a 'we'-heavy answer draws exactly the pronoun probe", () => {
  const transcript = "We worked on it. We decided together. We shipped it as a team.";
  assert.equal(decideProbe(covered(), transcript), 0);
});

test("a missing Result draws the outcome probe", () => {
  const transcript = "I did the work myself.";
  assert.equal(decideProbe(covered({ result: false }), transcript), 2);
});

test("a missing non-Result element draws the general probe", () => {
  const transcript = "I did the work myself.";
  assert.equal(decideProbe(covered({ task: false }), transcript), 1);
});

test("pronoun check takes priority over a missing element", () => {
  const transcript = "We did it together, as a team, with our whole group.";
  assert.equal(decideProbe(covered({ result: false }), transcript), 0);
});

test("the returned index always points into FIXED_PROBES", () => {
  const transcript = "We did it.";
  const index = decideProbe(covered(), transcript);
  assert.ok(index === null || (index >= 0 && index < FIXED_PROBES.length));
});
