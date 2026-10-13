import type { SharedCard } from "@vennmeet/shared";

// The shared-layer copy button (docs/SPEC-VENNMEET.md, "The shared
// layer", "At the end"): "agenda items covered, decisions with their
// timestamps, actions with owners." SharedRoom.cards is a flat bag
// with no notion of "sections" (sections are a deck/template concept,
// not a live-room one) — so "agenda" here means every card that isn't
// a decision or action, grouped by what it actually is.

function cardLine(card: SharedCard): string {
  switch (card.kind) {
    case "phrase":
      return card.text;
    case "note":
      return `${card.title}: ${card.text}`;
    case "list":
      return `${card.title}: ${card.lines.join(", ")}`;
    case "checklist":
      return `${card.title}: ${card.items.map((i) => `${i.done ? "[x]" : "[ ]"} ${i.text}`).join(", ")}`;
    case "number":
      return `${card.title}: ${card.value}`;
    case "goal":
      return `${card.title}: ${card.want}`;
    case "decision":
    case "action":
      return card.text; // handled separately below
  }
}

export function buildMinutesMarkdown(cards: SharedCard[]): string {
  const agenda = cards.filter((c) => c.kind !== "decision" && c.kind !== "action");
  const decisions = cards.filter((c): c is Extract<SharedCard, { kind: "decision" }> => c.kind === "decision");
  const actions = cards.filter((c): c is Extract<SharedCard, { kind: "action" }> => c.kind === "action");

  const lines: string[] = [];
  lines.push("## Agenda");
  lines.push(agenda.length ? agenda.map((c) => `- ${cardLine(c)}`).join("\n") : "- (nothing added)");

  lines.push("", "## Decisions");
  lines.push(
    decisions.length
      ? decisions.map((d) => `- ${d.text} — agreed by ${d.agreedBy}, ${new Date(d.at).toLocaleString()}`).join("\n")
      : "- (none)",
  );

  lines.push("", "## Actions");
  lines.push(
    actions.length
      ? actions.map((a) => `- ${a.text} — ${a.owner}${a.due ? `, due ${a.due}` : ""}`).join("\n")
      : "- (none)",
  );

  return lines.join("\n");
}
