import type { Deck, Mode } from "@vennmeet/shared";
import { HARDCODED_DECK } from "./hardcodedDeck";
import { mountLayer } from "./layer";
import { loadLayerPrefs, saveLayerPrefs } from "./prefs";
import { detectPlatform } from "./platform";
import { onShareChange } from "./shareWatcher";
import { startSharedSession, type SharedSession } from "./sharedSession";
import { mountSharedLayer } from "./sharedLayerView";

console.log("[venn] content script loaded on", location.href);

const DECK_STATE_KEY = "venn.scaffoldDeckState";
const MODE_KEY = "venn.mode";

async function loadDeck(): Promise<Deck> {
  const result = await chrome.storage.local.get(DECK_STATE_KEY);
  const stored = result[DECK_STATE_KEY] as Deck | undefined;
  return stored ?? structuredClone(HARDCODED_DECK);
}

async function saveDeck(deck: Deck): Promise<void> {
  await chrome.storage.local.set({ [DECK_STATE_KEY]: deck });
}

async function setMode(mode: Mode): Promise<void> {
  await chrome.storage.local.set({ [MODE_KEY]: mode });
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

  // "Private layer: on close, offer the three-field debrief... and
  // save it to the deck. Optional, one click dismisses"
  // (docs/SPEC-VENNMEET.md, "6. Minutes, debrief and onboarding").
  // null means the user clicked Skip — nothing to save.
  layer.onEndSession(async (debrief) => {
    if (!debrief) return;
    deck.debrief = debrief;
    await saveDeck(deck);
  });

  // Fires regardless of how collapse was triggered — the hotkey below,
  // the collapse button, or clicking the collapsed tab to reopen — so
  // prefs never drift from what's actually on screen.
  layer.onCollapseChange((collapsed) => {
    prefs.collapsed.private = collapsed;
    void saveLayerPrefs(platform, prefs);
  });

  // Free drag-to-reposition — persisted per platform like everything
  // else in prefs, so the panel stays where you put it next time.
  layer.onPositionChange((pos) => {
    prefs.posPx = pos;
    void saveLayerPrefs(platform, prefs);
  });

  // --- The shared layer (docs/SPEC-VENNMEET.md, "5. The relay and the shared layer") ---
  // No session exists yet — no socket is open. One is only ever
  // created in direct response to the user proposing or joining
  // (messages from the popup, below).
  let session: SharedSession | null = null;
  let hasRoom = false;
  let isSharing = false;

  const sharedLayer = mountSharedLayer(layer.root, {
    onMove: (id, pos) => session?.send({ type: "move", id, pos }),
    onPut: (card) => session?.send({ type: "put", card }),
    onPin: (id) => session?.send({ type: "pin", id }),
    onRemove: (id) => session?.send({ type: "remove", id }),
  });

  function updateSharedVisibility() {
    sharedLayer.setOpen(hasRoom && !isSharing);
  }

  function startSession(
    name: string,
    initial: { type: "propose" } | { type: "join"; code: string },
    onFirstRoom: (result: { code: string } | { error: string }) => void,
  ) {
    session?.destroy();
    let responded = false;
    sharedLayer.setMyName(name);
    session = startSharedSession(name, initial, {
      onRoom: (room) => {
        hasRoom = true;
        updateSharedVisibility();
        sharedLayer.setRoom(room);
        void setMode("both");
        if (!responded) {
          responded = true;
          onFirstRoom({ code: room.code });
        }
      },
      onPatch: (changed, removed) => {
        // Patches only carry *changed* cards; reconstruct a full room
        // view by asking sharedLayer to merge — simplest here is to
        // let setRoom-style merging happen inside sharedLayerView via
        // repeated setRoom calls is wasteful, so patch directly:
        sharedLayer.applyPatch(changed, removed);
      },
      onPresent: (present) => sharedLayer.setPresent(present),
      onDisconnected: () => {
        /* reconnect is automatic; nothing to surface for v1 */
      },
      onRoomLost: () => {
        if (!responded) {
          responded = true;
          onFirstRoom({ error: "That room no longer exists." });
        }
      },
    });
  }

  function endSession() {
    session?.destroy();
    session = null;
    hasRoom = false;
    updateSharedVisibility();
    void setMode("private-only");
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "toggle-layer") {
      if (!isSharing) layer.toggleCollapse();
      return;
    }
    if (msg?.type === "venn-propose") {
      startSession(msg.name, { type: "propose" }, (result) => sendResponse(result));
      return true; // async response
    }
    if (msg?.type === "venn-join") {
      startSession(msg.name, { type: "join", code: msg.code }, (result) => sendResponse(result));
      return true;
    }
    if (msg?.type === "venn-leave-shared") {
      endSession();
      sendResponse({ ok: true });
      return;
    }
  });

  // "On share start both layers disappear entirely... and toggle-layer
  // does nothing" (docs/SPEC-VENNMEET.md, "3. Hide on screen share").
  onShareChange((sharing) => {
    isSharing = sharing;
    layer.setSharing(sharing);
    updateSharedVisibility();
  });
}

void main();
