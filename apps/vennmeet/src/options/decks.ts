import type { Card, Deck, Template, Visibility } from "@vennmeet/shared";

const DECKS_KEY = "venn.decks"; // Record<id, Deck>

function genId(): string {
  return crypto.randomUUID();
}

// Adding an id to a Card-minus-id can't change which union member it
// is, but TS's inference doesn't track that through a spread inside
// .map() on a discriminated union — this makes the (sound) cast explicit
// in one place instead of silencing it ad hoc at every call site.
function withId(card: Omit<Card, "id">): Card {
  return { ...card, id: genId() } as Card;
}

function reId(card: Card): Card {
  return { ...card, id: genId() } as Card;
}

async function readAll(): Promise<Record<string, Deck>> {
  const result = await chrome.storage.local.get(DECKS_KEY);
  return (result[DECKS_KEY] as Record<string, Deck> | undefined) ?? {};
}

async function writeAll(decks: Record<string, Deck>): Promise<void> {
  await chrome.storage.local.set({ [DECKS_KEY]: decks });
}

export async function listDecks(): Promise<Deck[]> {
  const decks = await readAll();
  return Object.values(decks).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  const decks = await readAll();
  return decks[id];
}

export async function saveDeck(deck: Deck): Promise<void> {
  const decks = await readAll();
  decks[deck.id] = { ...deck, updatedAt: new Date().toISOString() };
  await writeAll(decks);
}

export async function deleteDeck(id: string): Promise<void> {
  const decks = await readAll();
  delete decks[id];
  await writeAll(decks);
}

/**
 * A template declares which layers it uses (docs/SPEC-VENNMEET.md,
 * "Templates"); a template spanning both layers (One to one, Client
 * meeting, Negotiation) produces one deck per layer, since Deck itself
 * feeds exactly one. `layersOverride` is for Blank, whose layers are
 * "chosen at start" rather than fixed by the template.
 */
export function createDecksFromTemplate(template: Template, layersOverride?: Visibility[]): Deck[] {
  const layers = layersOverride ?? template.layers;
  const now = new Date().toISOString();

  return layers.map((visibility) => ({
    id: genId(),
    name: template.name,
    template: template.id,
    visibility,
    sections: template.sections
      .filter((s) => s.visibility === visibility)
      .map((s) => ({
        id: genId(),
        title: s.title,
        cards: s.cards.map(withId),
      })),
    createdAt: now,
    updatedAt: now,
  }));
}

export function exportDeckJson(deck: Deck): string {
  return JSON.stringify(deck, null, 2);
}

/** Re-ids everything on import so importing the same file twice never collides with an existing deck. */
export function importDeckJson(json: string): Deck {
  const parsed = JSON.parse(json) as Deck;
  const now = new Date().toISOString();
  return {
    ...parsed,
    id: genId(),
    sections: parsed.sections.map((s) => ({
      ...s,
      id: genId(),
      cards: s.cards.map(reId),
    })),
    createdAt: now,
    updatedAt: now,
  };
}
