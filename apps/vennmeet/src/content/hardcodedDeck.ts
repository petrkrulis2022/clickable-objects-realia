import type { Deck } from "@vennmeet/shared";

// Scaffold deck for "2. The private layer" — one of every card kind
// except decision/action, which are shared-layer only. Real deck
// storage arrives in "4. Decks, editor and templates".
export const HARDCODED_DECK: Deck = {
  id: "demo",
  name: "Demo deck",
  template: "blank",
  visibility: "private",
  sections: [
    {
      id: "prep",
      title: "Prep",
      cards: [
        { id: "c1", kind: "phrase", title: "Opener", text: "Thanks for making time today." },
        {
          id: "c2",
          kind: "list",
          title: "Discovery questions",
          lines: ["What's driving this now?", "Who else is involved?", "What happens if you do nothing?"],
        },
        {
          id: "c3",
          kind: "checklist",
          title: "Before I hang up",
          items: [
            { text: "Confirm next step", done: false },
            { text: "Get a date", done: false },
            { text: "Thank them", done: false },
          ],
        },
      ],
    },
    {
      id: "numbers",
      title: "Numbers & notes",
      cards: [
        { id: "c4", kind: "number", title: "Churn this quarter", value: "0.45%", spoken: "zero point four five per cent" },
        { id: "c5", kind: "note", title: "If they push back on price", text: "Hold the number. Offer a smaller scope instead of a discount." },
        { id: "c6", kind: "goal", title: "This call", want: "Get to a second meeting with their CFO", walkAway: "No meeting booked by Friday" },
      ],
    },
  ],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};
