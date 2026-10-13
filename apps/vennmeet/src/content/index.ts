import type { Deck } from "@vennmeet/shared";
import { HARDCODED_DECK } from "./hardcodedDeck";
import { mountLayer } from "./layer";
import { loadLayerPrefs, saveLayerPrefs } from "./prefs";
import { detectPlatform } from "./platform";
import { onShareChange } from "./shareWatcher";

console.log("[venn] content script loaded on", location.href);

const DECK_STATE_KEY = "venn.scaffoldDeckState";

async function loadDeck(): Promise<Deck> {
  const result = await chrome.storage.local.get(DECK_STATE_KEY);
  const stored = result[DECK_STATE_KEY] as Deck | undefined;
  return stored ?? structuredClone(HARDCODED_DECK);
}

async function saveDeck(deck: Deck): Promise<void> {
  await chrome.storage.local.set({ [DECK_STATE_KEY]: deck });
}

async function main() {
  const platform = detectPlatform();
  const layer = mountLayer();

  const [prefs, deck] = await Promise.all([loadLayerPrefs(platform), loadDeck()]);

  layer.setPrefs(prefs);
  layer.setDeck(deck);

  layer.onChecklistToggle(async (cardId, itemIndex) => {
    const section = deck.sections.find((s) => s.cards.some((c) => c.id === cardId));
    const card = section?.cards.find((c) => c.id === cardId);
    if (card?.kind !== "checklist") return;
    card.items[itemIndex].done = !card.items[itemIndex].done;
    layer.setDeck(deck);
    await saveDeck(deck);
  });

  // Fires regardless of how collapse was triggered — the hotkey below,
  // the collapse button, or clicking the collapsed tab to reopen — so
  // prefs never drift from what's actually on screen.
  layer.onCollapseChange((collapsed) => {
    prefs.collapsed.private = collapsed;
    void saveLayerPrefs(platform, prefs);
  });

  // "On share start both layers disappear entirely... and toggle-layer
  // does nothing" (docs/SPEC-VENNMEET.md, "3. Hide on screen share").
  let isSharing = false;
  onShareChange((sharing) => {
    isSharing = sharing;
    layer.setSharing(sharing);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "toggle-layer" && !isSharing) layer.toggleCollapse();
  });
}

void main();
