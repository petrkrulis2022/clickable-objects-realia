// Shared protocol types for Venn.
// TypeScript types only — no runtime code. Both apps/vennmeet and
// apps/vennmeet-relay import from here so the protocol cannot drift
// between them. See docs/SPEC-VENNMEET.md, "Architecture and data model".

export type Id = string;
export type Visibility = "private" | "shared";

export type Card =
  | { id: Id; kind: "phrase"; title?: string; text: string }
  | { id: Id; kind: "list"; title: string; lines: string[] }
  | { id: Id; kind: "checklist"; title: string; items: { text: string; done: boolean }[] }
  | { id: Id; kind: "number"; title: string; value: string; spoken?: string }
  | { id: Id; kind: "note"; title: string; text: string }
  | { id: Id; kind: "goal"; title: string; want: string; walkAway?: string }
  // shared layer only
  | { id: Id; kind: "decision"; text: string; agreedBy: string; at: string }
  | { id: Id; kind: "action"; text: string; owner: string; due?: string };

export type CardKind = Card["kind"];

export interface Section {
  id: Id;
  title: string;
  cards: Card[]; // max 6 shown
}

export interface Debrief {
  surprised: string;
  better: string;
  followUp: string;
  at: string;
}

export interface Deck {
  id: Id;
  name: string;
  template: string;
  visibility: Visibility; // which layer this deck feeds
  sections: Section[];
  debrief?: Debrief;
  createdAt: string;
  updatedAt: string;
  /** True for a deck (or draft) an AI assistant drafted from uploaded materials, not yet reviewed. Cleared on first edit or explicit dismissal — informational, not a hard gate like ScreenView's per-story draftedByModel. */
  draftedByModel?: boolean;
}

export type Pos = { x: number; y: number };

// A card as it exists on the shared layer: the SPEC's ClientMessage
// 'move' needs somewhere to persist a position, and 'patch' needs to
// carry it (plus hold/pin state) to peers — neither is on the base
// Card type, since private-layer cards are listed, never freely
// dragged on a stage. Filling that gap here, in the one place both
// SharedRoom and ServerMessage.patch read from, so it can't drift.
export type SharedCard = Card & { pos?: Pos; pinnedBy?: string; heldBy?: string | null };

// Only this crosses the network, and only when a shared layer is open.
export interface SharedRoom {
  code: string;
  rev: number;
  cards: Record<Id, SharedCard>;
  present: { name: string; joinedAt: string }[];
}

export type ClientMessage =
  | { type: "propose"; name: string } // returns a code
  | { type: "join"; code: string; name: string }
  | { type: "put"; card: Card }
  | { type: "move"; id: Id; pos: Pos }
  | { type: "pin"; id: Id }
  | { type: "remove"; id: Id }
  | { type: "leave" };

export type ServerMessage =
  | { type: "room"; room: SharedRoom; you: string }
  | { type: "patch"; rev: number; changed: SharedCard[]; removed: Id[] }
  | { type: "present"; present: SharedRoom["present"] };

export interface LayerPrefs {
  dock: "top" | "left" | "right";
  size: "S" | "M" | "L";
  opacity: number; // 0.7 - 1.0
  collapsed: { private: boolean; shared: boolean };
  /** Free-dragged position in viewport pixels, overriding `dock` once set. Undefined means "use the dock preset" — the default until the user first drags the panel. */
  posPx?: { x: number; y: number };
}

// --- Template schema (docs/SPEC-VENNMEET.md, "Templates") ---
// A template is a starting deck, not code: declares which layers it
// uses and ships example sections/cards the user rewrites. Several
// templates (One to one, Client meeting, Negotiation) use BOTH layers
// at once, with different sections belonging to each — so visibility
// is per-section, and the template declares the set of layers across
// all its sections.

export interface TemplateSection {
  title: string;
  visibility: Visibility;
  cards: Omit<Card, "id">[];
}

export interface Template {
  id: string;
  name: string;
  layers: Visibility[]; // e.g. ['private'], ['shared'], or ['private', 'shared']
  sections: TemplateSection[];
}

// --- Mode (docs/SPEC-VENNMEET.md, "The shared layer", "Three modes") ---

export type Mode = "private-only" | "shared-only" | "both";
