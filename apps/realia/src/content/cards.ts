import type { Card, StageObject } from "@realia/shared";
import type { OverlayHandle } from "./overlay";

export interface CardsControllerOptions {
  overlay: OverlayHandle;
  objects: StageObject[];
  sendReveal: (cardId: string, stage: 1 | 2 | 3) => void;
}

export interface CardsController {
  destroy(): void;
}

/**
 * Reveal cards (docs/PRD.md, "6. Reveal cards"): four states — word,
 * audio, picture, translation — advanced one at a time by tapping,
 * entirely per-viewer and never part of synced room state. Audio is
 * two pre-generated files per word (never synthesised at runtime, no
 * API key in the extension); tapping again once fully revealed
 * replays the slow file, matching the teacher's own habit of
 * repeating a word more slowly on request.
 */
export function attachCardsController(opts: CardsControllerOptions): CardsController {
  const { overlay, objects, sendReveal } = opts;
  const revealStage = new Map<string, 0 | 1 | 2 | 3>();

  function findCard(id: string): Card | undefined {
    const obj = objects.find((o) => o.id === id);
    return obj?.kind === "card" ? (obj as Card) : undefined;
  }

  function playAudio(card: Card, speed: "normal" | "slow") {
    const audio = new Audio(chrome.runtime.getURL(card.audio[speed]));
    audio.play().catch(() => {
      /* blocked by autoplay policy — shouldn't happen off a direct tap gesture */
    });
  }

  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const el = target.closest('.co-object[data-kind="card"]') as HTMLElement | null;
    if (!el) return;
    const id = el.dataset.id;
    if (!id) return;
    const card = findCard(id);
    if (!card) return;

    const current = revealStage.get(id) ?? 0;
    if (current >= 3) {
      playAudio(card, "slow"); // fully revealed already — repeat taps replay the slow file
      return;
    }

    const next = (current + 1) as 1 | 2 | 3;
    revealStage.set(id, next);
    overlay.setCardReveal(id, next);
    if (next === 1) playAudio(card, "normal");
    sendReveal(id, next);
  }

  overlay.objectsEl.addEventListener("click", onClick);

  return {
    destroy: () => {
      overlay.objectsEl.removeEventListener("click", onClick);
    },
  };
}
