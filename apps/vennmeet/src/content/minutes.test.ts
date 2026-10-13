import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMinutesMarkdown } from "./minutes";
import type { SharedCard } from "@vennmeet/shared";

test("every decision and action appears with its metadata", () => {
  const cards: SharedCard[] = [
    { id: "1", kind: "list", title: "Agenda", lines: ["Check in", "Open topics"] },
    { id: "2", kind: "decision", text: "Ship the new pricing page", agreedBy: "Alice", at: "2026-10-13T15:00:00.000Z" },
    { id: "3", kind: "decision", text: "Push the launch to next week", agreedBy: "Bob", at: "2026-10-13T15:10:00.000Z" },
    { id: "4", kind: "action", text: "Draft the announcement email", owner: "Alice", due: "2026-10-17" },
    { id: "5", kind: "action", text: "Book the follow-up call", owner: "Bob" },
  ];

  const md = buildMinutesMarkdown(cards);

  assert.match(md, /## Agenda/);
  assert.match(md, /Agenda: Check in, Open topics/);

  assert.match(md, /## Decisions/);
  assert.match(md, /Ship the new pricing page — agreed by Alice, /);
  assert.match(md, /Push the launch to next week — agreed by Bob, /);

  assert.match(md, /## Actions/);
  assert.match(md, /Draft the announcement email — Alice, due 2026-10-17/);
  assert.match(md, /Book the follow-up call — Bob/);
  // No due date — must not print a dangling ", due" with nothing after it.
  assert.doesNotMatch(md, /Book the follow-up call — Bob, due/);
});

test("empty sections say so rather than printing nothing", () => {
  const md = buildMinutesMarkdown([]);
  assert.match(md, /## Agenda\n- \(nothing added\)/);
  assert.match(md, /## Decisions\n- \(none\)/);
  assert.match(md, /## Actions\n- \(none\)/);
});
