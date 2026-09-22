import type { Backdrop, StageObject } from "@co/shared";
import {
  BACKDROP_CROSSFADE_MS,
  EMOJI_FONT_SIZE_PX,
  OBJECT_BORDER,
  OBJECT_LABEL_COLOR,
  OBJECT_LABEL_FONT_SIZE_PX,
  OBJECT_LABEL_WEIGHT,
  OBJECT_MIN_SIZE_PX,
  OBJECT_RADIUS_PX,
  OBJECT_SHADOW,
  SCRIM_COLOR,
  SCRIM_FEATHER_PX,
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
`;

export interface OverlayHandle {
  root: ShadowRoot;
  stageEl: HTMLDivElement;
  objectsEl: HTMLDivElement;
  getStage(): StageRect;
  setBackdrop(backdrop: Backdrop | null): void;
  setObjects(objects: StageObject[]): void;
  getObjectEl(id: string): HTMLElement | undefined;
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

  document.body.appendChild(host);

  let stage = computeStage(window.innerWidth, window.innerHeight);
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
    const { w, h } = sizeToPagePx(stage, obj.size, OBJECT_MIN_SIZE_PX);
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
      if (!el) {
        el = buildObjectEl(obj);
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

    incoming.style.backgroundImage = `url("${backdrop.src}")`;
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

  function handleResize() {
    stage = computeStage(window.innerWidth, window.innerHeight);
    layoutStage();
    for (const obj of lastObjects) {
      const el = objectEls.get(obj.id);
      if (el) layoutObject(obj, el);
    }
    for (const cb of resizeCbs) cb(stage);
  }

  layoutStage();
  window.addEventListener("resize", handleResize);

  return {
    root,
    stageEl,
    objectsEl,
    getStage: () => stage,
    setBackdrop,
    setObjects,
    getObjectEl: (id) => objectEls.get(id),
    onResize: (cb) => resizeCbs.push(cb),
    destroy: () => {
      window.removeEventListener("resize", handleResize);
      host.remove();
    },
  };
}
