import type { InterviewDeck } from "@screenview/shared";
import { mountShadowLayer, type ShadowLayer } from "@overlay/shared";
import { DOCK_BOTTOM_PX, DOCK_LEFT_PX, DOCK_WIDTH_PX, PANEL_BG, PANEL_RADIUS_PX, PANEL_SHADOW, SYSTEM_FONT_STACK, TEXT_COLOR } from "../content/design";

export interface DeckView {
  setHidden(hidden: boolean): void;
  destroy(): void;
}

/**
 * "The coverage deck rendered as a private layer, docked under the
 * webcam... One card per competency showing the competency and the
 * linked story's title. Nothing else" (docs/SPEC-SCREENVIEW.md,
 * "6. Interview mode and onboarding"). No sentences, no notes, no
 * STAR text — just two short strings per card, read from storage.
 */
export function mountDeckView(deck: InterviewDeck): DeckView {
  const layer: ShadowLayer = mountShadowLayer("screenview-interview-host", "screenview-interview-layer");

  const style = document.createElement("style");
  style.textContent = `
    .sv-deck-panel {
      position: absolute;
      left: ${DOCK_LEFT_PX}px;
      bottom: ${DOCK_BOTTOM_PX}px;
      width: ${DOCK_WIDTH_PX}px;
      font-family: ${SYSTEM_FONT_STACK};
      color: ${TEXT_COLOR};
      background: ${PANEL_BG};
      border-radius: ${PANEL_RADIUS_PX}px;
      box-shadow: ${PANEL_SHADOW};
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 50vh;
      overflow-y: auto;
      transition: opacity 150ms ease;
    }
    .sv-deck-card { border-left: 3px solid rgba(255,255,255,0.25); padding-left: 8px; }
    .sv-deck-competency { font-size: 12px; font-weight: 600; }
    .sv-deck-story { font-size: 12px; opacity: 0.75; }
    .sv-deck-gap { opacity: 0.5; font-style: italic; }
  `;
  layer.root.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "sv-deck-panel";
  layer.layerEl.appendChild(panel);

  for (const card of deck.cards) {
    const el = document.createElement("div");
    el.className = "sv-deck-card";
    const competencyEl = document.createElement("div");
    competencyEl.className = "sv-deck-competency";
    competencyEl.textContent = card.competency;
    const storyEl = document.createElement("div");
    storyEl.className = "sv-deck-story" + (card.storyTitle ? "" : " sv-deck-gap");
    storyEl.textContent = card.storyTitle || "no story yet";
    el.append(competencyEl, storyEl);
    panel.appendChild(el);
  }

  return {
    setHidden(hidden) {
      panel.style.display = hidden ? "none" : "flex";
    },
    destroy() {
      layer.destroy();
    },
  };
}
