import type { Backdrop, Card, StageObject } from "@realia/shared";
import {
  BACKDROP_CROSSFADE_MS,
  CHIP_FONT_SIZE_PX,
  DROP_ZONE_BORDER,
  GAP_TEXT_FONT_SIZE_PX,
  ZONE_BG,
  ZONE_LABEL_FONT_SIZE_PX,
  EMOJI_FONT_SIZE_PX,
  HELD_SCALE,
  HELD_SHADOW,
  OBJECT_BORDER,
  OBJECT_LABEL_COLOR,
  OBJECT_LABEL_FONT_SIZE_PX,
  OBJECT_LABEL_WEIGHT,
  OBJECT_MIN_SIZE_PX,
  OBJECT_RADIUS_PX,
  OBJECT_SHADOW,
  SCRIM_COLOR,
  SCRIM_FEATHER_PX,
  SENTENCE_FONT_SIZE_PX,
  SENTENCE_GAP_PX,
  SYSTEM_FONT_STACK,
  Z_INDEX_MAX,
} from "./design";
import { computeStage, sizeToPagePx, stageToPagePx, type StageRect } from "./stage";

const CSS = `
  :host { all: initial; }
  .co-layer {
    position: fixed;
    inset: 0;
    z-index: ${Z_INDEX_MAX};
    pointer-events: none;
    font-family: ${SYSTEM_FONT_STACK};
  }
  .co-stage {
    position: absolute;
    overflow: visible;
  }
  .co-scrim {
    position: absolute;
    inset: 0;
    background: ${SCRIM_COLOR};
    -webkit-mask-image:
      linear-gradient(to right, transparent 0, black ${SCRIM_FEATHER_PX}px, black calc(100% - ${SCRIM_FEATHER_PX}px), transparent 100%),
      linear-gradient(to bottom, transparent 0, black ${SCRIM_FEATHER_PX}px, black calc(100% - ${SCRIM_FEATHER_PX}px), transparent 100%);
    -webkit-mask-composite: source-in;
    mask-image:
      linear-gradient(to right, transparent 0, black ${SCRIM_FEATHER_PX}px, black calc(100% - ${SCRIM_FEATHER_PX}px), transparent 100%),
      linear-gradient(to bottom, transparent 0, black ${SCRIM_FEATHER_PX}px, black calc(100% - ${SCRIM_FEATHER_PX}px), transparent 100%);
    mask-composite: intersect;
    pointer-events: none;
  }
  .co-backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-position: center;
    opacity: 0;
    transition: opacity ${BACKDROP_CROSSFADE_MS}ms linear;
    pointer-events: none;
  }
  .co-backdrop.co-visible { opacity: var(--co-backdrop-dim, 1); }
  .co-objects { position: absolute; inset: 0; }
  .co-object {
    position: absolute;
    box-sizing: border-box;
    min-width: ${OBJECT_MIN_SIZE_PX}px;
    min-height: ${OBJECT_MIN_SIZE_PX}px;
    border-radius: ${OBJECT_RADIUS_PX}px;
    background: #fff;
    border: ${OBJECT_BORDER};
    box-shadow: ${OBJECT_SHADOW};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    pointer-events: auto;
    user-select: none;
    touch-action: none;
    will-change: transform;
  }
  .co-object .co-emoji { font-size: ${EMOJI_FONT_SIZE_PX}px; line-height: 1; }
  .co-object .co-label {
    font-size: ${OBJECT_LABEL_FONT_SIZE_PX}px;
    font-weight: ${OBJECT_LABEL_WEIGHT};
    color: ${OBJECT_LABEL_COLOR};
  }
  .co-object[data-kind="draggable"] { cursor: grab; }
  .co-object.co-held {
    cursor: grabbing;
    transform: scale(${HELD_SCALE});
    box-shadow: ${HELD_SHADOW};
    z-index: 9999;
  }
  .co-object[data-kind="zone"] {
    background: transparent;
    border: ${DROP_ZONE_BORDER};
    box-shadow: none;
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms linear;
  }
  .co-object[data-kind="zone"].co-zone-visible { opacity: 1; }
  .co-object[data-kind="card"] { cursor: pointer; gap: 4px; }
  .co-object[data-kind="card"] .co-card-audio-dot,
  .co-object[data-kind="card"] .co-card-emoji,
  .co-object[data-kind="card"] .co-card-translation {
    display: none;
  }
  .co-object[data-kind="card"].co-reveal-1 .co-card-audio-dot { display: inline-block; font-size: 16px; }
  .co-object[data-kind="card"].co-reveal-2 .co-card-emoji { display: inline-block; font-size: 28px; }
  .co-object[data-kind="card"].co-reveal-3 .co-card-translation {
    display: inline-block;
    font-size: 13px;
    color: #555;
  }
  .co-card-dots {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -14px;
    display: flex;
    justify-content: center;
    gap: 4px;
  }
  .co-card-dots .co-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
  }
  .co-card-dots .co-dot.co-dot-filled { background: #fff; }
  /* --- Generalised kinds (sort, gap, match). Opaque on live video, never the 88px minimum. --- */
  .co-object[data-variant] { min-width: 0; min-height: 0; }
  .co-object[data-variant="chip"] {
    border-radius: 8px;
    padding: 2px 6px;
    gap: 4px;
    flex-direction: row;
  }
  .co-object[data-variant="chip"] .co-label {
    font-size: ${CHIP_FONT_SIZE_PX}px;
    line-height: 1.15;
    text-align: center;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .co-object[data-variant="chip"] .co-emoji { font-size: 18px; }
  .co-object[data-kind="zone"][data-variant] {
    opacity: 1;
    background: ${ZONE_BG};
    border: ${DROP_ZONE_BORDER};
    justify-content: flex-start;
    align-items: stretch;
    padding: 4px 8px;
  }
  .co-zone-label {
    color: #fff;
    font-size: ${ZONE_LABEL_FONT_SIZE_PX}px;
    font-weight: 600;
    line-height: 1.2;
    overflow: hidden;
  }
  .co-object[data-variant="bin"] .co-zone-label { text-align: center; text-transform: uppercase; letter-spacing: 0.04em; }
  .co-object[data-variant="slot"] .co-zone-label { font-size: 13px; color: #ddd; }
  .co-object[data-kind="text"] {
    min-width: 0;
    min-height: 0;
    display: block;
    padding: 8px 12px;
    pointer-events: none;
    font-size: ${GAP_TEXT_FONT_SIZE_PX}px;
    line-height: 1.5;
    color: ${OBJECT_LABEL_COLOR};
    overflow: hidden;
  }
  .co-object[data-kind="text"].co-text-long { font-size: ${GAP_TEXT_FONT_SIZE_PX - 3}px; line-height: 1.4; }
  .co-gap-mark {
    display: inline-block;
    min-width: 2.2em;
    margin: 0 2px;
    border-bottom: 2px solid #1a1a1a;
    text-align: center;
    font-size: 0.8em;
    font-weight: 700;
    color: #3a6ee8;
  }
  .co-card-silent {
    position: absolute;
    top: 3px;
    right: 5px;
    font-size: 12px;
    opacity: 0.75;
  }
  .co-sentence {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    margin-top: ${SENTENCE_GAP_PX}px;
    text-align: center;
    font-size: ${SENTENCE_FONT_SIZE_PX}px;
    color: #fff;
    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
    pointer-events: none;
  }
`;

/** Renders a gap exercise's text, drawing each "[n]" marker as a numbered blank. Text only — never HTML. */
function appendGapText(el: HTMLElement, text: string) {
  const parts = text.split(/\[(\d+)\]/);
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part) el.appendChild(document.createTextNode(part));
      return;
    }
    const mark = document.createElement("span");
    mark.className = "co-gap-mark";
    mark.textContent = part;
    el.appendChild(mark);
  });
}

export interface OverlayHandle {
  root: ShadowRoot;
  stageEl: HTMLDivElement;
  objectsEl: HTMLDivElement;
  getStage(): StageRect;
  setBackdrop(backdrop: Backdrop | null): void;
  setObjects(objects: StageObject[]): void;
  getObjectEl(id: string): HTMLElement | undefined;
  setZoneHighlight(zoneIds: ReadonlySet<string>): void;
  setSentence(text: string | null): void;
  setCardReveal(cardId: string, stage: 0 | 1 | 2 | 3): void;
  /** Teacher-only: how far the student has revealed this card. */
  setCardPeerProgress(cardId: string, stage: 0 | 1 | 2 | 3): void;
  /** Reserves space on the left for the teacher panel so the stage never overlaps it. */
  setLeftInset(px: number): void;
  onResize(cb: (stage: StageRect) => void): void;
  destroy(): void;
}

/**
 * Injects the single overlay root into document.body behind an open
 * shadow root, per docs/PRD.md: "Treat Meet as a background image."
 * This never queries or attaches to any Google Meet DOM element.
 */
export function mountOverlay(): OverlayHandle {
  const host = document.createElement("div");
  host.id = "clickable-objects-root";
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);

  const layer = document.createElement("div");
  layer.className = "co-layer";
  root.appendChild(layer);

  const stageEl = document.createElement("div");
  stageEl.className = "co-stage";
  layer.appendChild(stageEl);

  const backdropA = document.createElement("div");
  const backdropB = document.createElement("div");
  backdropA.className = "co-backdrop";
  backdropB.className = "co-backdrop";
  stageEl.appendChild(backdropA);
  stageEl.appendChild(backdropB);
  const backdropEls: [HTMLDivElement, HTMLDivElement] = [backdropA, backdropB];
  let activeBackdrop = 0;
  let currentBackdropSrc: string | null = null;

  const scrim = document.createElement("div");
  scrim.className = "co-scrim";
  stageEl.appendChild(scrim);

  const objectsEl = document.createElement("div");
  objectsEl.className = "co-objects";
  stageEl.appendChild(objectsEl);

  const sentenceEl = document.createElement("div");
  sentenceEl.className = "co-sentence";
  stageEl.appendChild(sentenceEl);

  document.body.appendChild(host);

  let leftInsetPx = 0;
  let stage = computeStage(window.innerWidth, window.innerHeight, leftInsetPx);
  const objectEls = new Map<string, HTMLElement>();
  let lastObjects: StageObject[] = [];
  const resizeCbs: Array<(s: StageRect) => void> = [];

  function layoutStage() {
    stageEl.style.left = `${stage.x}px`;
    stageEl.style.top = `${stage.y}px`;
    stageEl.style.width = `${stage.w}px`;
    stageEl.style.height = `${stage.h}px`;
  }

  function layoutObject(obj: StageObject, el: HTMLElement) {
    const { x, y } = stageToPagePx(stage, obj.pos);
    const minPx = obj.variant || obj.kind === "text" ? 0 : OBJECT_MIN_SIZE_PX;
    const { w, h } = sizeToPagePx(stage, obj.size, minPx);
    // Object position is stage-relative; the stage element is itself
    // positioned in page coordinates, so children use stage-local px.
    const localX = x - stage.x;
    const localY = y - stage.y;
    el.style.left = `${localX}px`;
    el.style.top = `${localY}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.zIndex = String(obj.z);
  }

  function buildObjectEl(obj: StageObject): HTMLElement {
    const el = document.createElement("div");
    el.className = "co-object";
    el.dataset.id = obj.id;
    el.dataset.kind = obj.kind;
    if (obj.variant) el.dataset.variant = obj.variant;

    if (obj.kind === "zone") {
      // The original place zones stay an empty dashed outline; bins and slots carry their label.
      if (obj.variant) {
        const label = document.createElement("span");
        label.className = "co-zone-label";
        label.textContent = obj.label;
        el.appendChild(label);
      }
      return el;
    }

    if (obj.kind === "text") {
      appendGapText(el, obj.label);
      if (obj.label.length > 220) el.classList.add("co-text-long");
      return el;
    }

    if (obj.kind === "card") {
      const card = obj as Card;
      const word = document.createElement("span");
      word.className = "co-card-word co-label";
      word.textContent = card.word;
      el.appendChild(word);

      const audioDot = document.createElement("span");
      audioDot.className = "co-card-audio-dot";
      audioDot.textContent = card.audio ? "🔊" : "🔇";
      el.appendChild(audioDot);

      // No recording exists for this word: say so, rather than voice it with a fallback.
      if (!card.audio) {
        const silent = document.createElement("span");
        silent.className = "co-card-silent";
        silent.textContent = "🔇";
        silent.title = "No recording for this word";
        el.appendChild(silent);
        el.dataset.silent = "true";
      }

      const emoji = document.createElement("span");
      emoji.className = "co-card-emoji";
      emoji.textContent = card.emoji ?? "";
      el.appendChild(emoji);

      const translation = document.createElement("span");
      translation.className = "co-card-translation";
      translation.textContent = card.translation;
      el.appendChild(translation);

      const dots = document.createElement("div");
      dots.className = "co-card-dots";
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement("span");
        dot.className = "co-dot";
        dots.appendChild(dot);
      }
      el.appendChild(dots);

      return el;
    }

    if (obj.emoji) {
      const emoji = document.createElement("span");
      emoji.className = "co-emoji";
      emoji.textContent = obj.emoji;
      el.appendChild(emoji);
    }

    const label = document.createElement("span");
    label.className = "co-label";
    label.textContent = obj.label;
    el.appendChild(label);

    return el;
  }

  function setObjects(objects: StageObject[]) {
    const seen = new Set<string>();
    for (const obj of objects) {
      seen.add(obj.id);
      let el = objectEls.get(obj.id);
      if (el && (el.dataset.kind !== obj.kind || (el.dataset.variant ?? "") !== (obj.variant ?? "") || el.dataset.label !== obj.label)) {
        el.remove();
        objectEls.delete(obj.id);
        el = undefined;
      }
      if (!el) {
        el = buildObjectEl(obj);
        el.dataset.label = obj.label;
        objectEls.set(obj.id, el);
        objectsEl.appendChild(el);
      }
      layoutObject(obj, el);
    }
    for (const [id, el] of objectEls) {
      if (!seen.has(id)) {
        el.remove();
        objectEls.delete(id);
      }
    }
    lastObjects = objects;
  }

  function setBackdrop(backdrop: Backdrop | null) {
    const nextSrc = backdrop?.src ?? null;
    if (nextSrc === currentBackdropSrc) return;
    currentBackdropSrc = nextSrc;

    const incoming = backdropEls[1 - activeBackdrop];
    const outgoing = backdropEls[activeBackdrop];

    if (!backdrop) {
      outgoing.classList.remove("co-visible");
      incoming.classList.remove("co-visible");
      incoming.style.backgroundImage = "";
      return;
    }

    // backdrop.src is a pack-relative path (e.g. "backdrops/livingroom.jpg"),
    // shipped with the extension per docs/PRD.md, "A backdrop is a
    // picture, not an object... packaged with the pack, never a remote URL."
    incoming.style.backgroundImage = `url("${chrome.runtime.getURL(backdrop.src)}")`;
    incoming.style.backgroundSize = backdrop.fit === "contain" ? "contain" : "cover";
    incoming.style.backgroundPosition = "center";
    incoming.style.backgroundRepeat = "no-repeat";
    incoming.style.setProperty("--co-backdrop-dim", String(1 - (backdrop.dim ?? 0)));
    // Force layout so the opacity transition actually runs.
    void incoming.offsetWidth;
    incoming.classList.add("co-visible");
    outgoing.classList.remove("co-visible");
    activeBackdrop = 1 - activeBackdrop;
  }

  function recomputeStage() {
    stage = computeStage(window.innerWidth, window.innerHeight, leftInsetPx);
    layoutStage();
    for (const obj of lastObjects) {
      const el = objectEls.get(obj.id);
      if (el) layoutObject(obj, el);
    }
    for (const cb of resizeCbs) cb(stage);
  }

  function setLeftInset(px: number) {
    if (px === leftInsetPx) return;
    leftInsetPx = px;
    recomputeStage();
  }

  layoutStage();
  window.addEventListener("resize", recomputeStage);

  function setZoneHighlight(zoneIds: ReadonlySet<string>) {
    for (const [id, el] of objectEls) {
      if (el.dataset.kind !== "zone") continue;
      el.classList.toggle("co-zone-visible", zoneIds.has(id));
    }
  }

  function setSentence(text: string | null) {
    sentenceEl.textContent = text ?? "";
  }

  function setCardReveal(cardId: string, stage: 0 | 1 | 2 | 3) {
    const el = objectEls.get(cardId);
    if (!el) return;
    el.classList.toggle("co-reveal-1", stage >= 1);
    el.classList.toggle("co-reveal-2", stage >= 2);
    el.classList.toggle("co-reveal-3", stage >= 3);
  }

  function setCardPeerProgress(cardId: string, stage: 0 | 1 | 2 | 3) {
    const el = objectEls.get(cardId);
    if (!el) return;
    const dots = el.querySelectorAll(".co-card-dots .co-dot");
    dots.forEach((dot, i) => dot.classList.toggle("co-dot-filled", i < stage));
  }

  return {
    root,
    stageEl,
    objectsEl,
    getStage: () => stage,
    setBackdrop,
    setObjects,
    getObjectEl: (id) => objectEls.get(id),
    setZoneHighlight,
    setSentence,
    setCardReveal,
    setCardPeerProgress,
    setLeftInset,
    onResize: (cb) => resizeCbs.push(cb),
    destroy: () => {
      window.removeEventListener("resize", recomputeStage);
      host.remove();
    },
  };
}
