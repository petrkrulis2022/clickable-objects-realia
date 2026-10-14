import type { StarPart } from "@screenview/shared";
import { applyPanelPosition, attachDragHandle, computeStage, mountShadowLayer, type ShadowLayer } from "@overlay/shared";
import {
  COVERED_COLOR,
  PANEL_BG,
  PANEL_RADIUS_PX,
  PANEL_SHADOW,
  SYSTEM_FONT_STACK,
  TEXT_COLOR,
} from "../content/design";
import { PART_ORDER } from "./fade";

const PART_LABEL: Record<StarPart, string> = {
  situation: "Situation",
  task: "Task",
  action: "Action",
  result: "Result",
};

const STAGE_POS_KEY = "screenview.stagePanelPos";

export interface StageView {
  /** Lights a block — "blocks change state only, no text appears while the candidate is speaking" (SPEC). */
  setCovered(part: StarPart, covered: boolean): void;
  setNotes(part: StarPart, text: string): void;
  setElapsedSeconds(seconds: number): void;
  setFillerCount(count: number): void;
  /** There's no voice-activity detection here — the candidate marks their own answer finished, the way they start it. */
  onDone(cb: () => void): void;
  destroy(): void;
}

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * The practice stage: four STAR blocks plus two live numbers, nothing
 * else — "no text appears on the layer during an answer, ever" (SPEC,
 * "3. The practice session loop"). Blocks only ever change a covered
 * boolean and show pre-written notes text set once before the answer
 * starts (per fade level); nothing here renders live transcript text.
 */
export function mountStageView(): StageView {
  const layer: ShadowLayer = mountShadowLayer("screenview-stage-host", "screenview-stage-layer");

  const style = document.createElement("style");
  style.textContent = `
    .sv-stage-panel {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      font-family: ${SYSTEM_FONT_STACK};
      color: ${TEXT_COLOR};
      pointer-events: none;
    }
    .sv-numbers { display: flex; gap: 20px; font-variant-numeric: tabular-nums; }
    .sv-number { background: ${PANEL_BG}; border-radius: ${PANEL_RADIUS_PX}px; box-shadow: ${PANEL_SHADOW}; padding: 6px 14px; font-size: 18px; font-weight: 600; }
    .sv-blocks { display: flex; gap: 10px; }
    .sv-block {
      background: ${PANEL_BG};
      border-radius: ${PANEL_RADIUS_PX}px;
      box-shadow: ${PANEL_SHADOW};
      border: 2px solid rgba(255,255,255,0.15);
      padding: 10px 14px;
      min-width: 110px;
      max-width: 160px;
      transition: border-color 150ms ease, background 150ms ease;
    }
    .sv-block.sv-covered { border-color: ${COVERED_COLOR}; }
    .sv-block-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; }
    .sv-block-notes { font-size: 13px; margin-top: 4px; min-height: 1em; }
    .sv-done-btn {
      pointer-events: auto;
      font-family: ${SYSTEM_FONT_STACK};
      font-size: 13px;
      border-radius: 999px;
      padding: 6px 16px;
      border: 1px solid rgba(255,255,255,0.25);
      background: #2e2e31;
      color: ${TEXT_COLOR};
      cursor: pointer;
    }
    .sv-done-btn:hover { background: #3a3a3d; }
    .sv-stage-drag-handle {
      pointer-events: auto;
      position: absolute;
      top: -10px;
      left: -10px;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.2);
      background: ${PANEL_BG};
      color: ${TEXT_COLOR};
      font-size: 12px;
      cursor: grab;
      touch-action: none;
    }
  `;
  layer.root.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "sv-stage-panel";
  layer.layerEl.appendChild(panel);

  const dragHandle = document.createElement("button");
  dragHandle.className = "sv-stage-drag-handle";
  dragHandle.textContent = "⠿";
  dragHandle.title = "Drag to move";
  panel.appendChild(dragHandle);

  const numbers = document.createElement("div");
  numbers.className = "sv-numbers";
  const elapsedEl = document.createElement("div");
  elapsedEl.className = "sv-number";
  elapsedEl.textContent = "0:00";
  const fillerEl = document.createElement("div");
  fillerEl.className = "sv-number";
  fillerEl.textContent = "0 fillers";
  numbers.append(elapsedEl, fillerEl);
  panel.appendChild(numbers);

  const blocks = document.createElement("div");
  blocks.className = "sv-blocks";
  panel.appendChild(blocks);

  const doneBtn = document.createElement("button");
  doneBtn.className = "sv-done-btn";
  doneBtn.textContent = "I'm done answering";
  panel.appendChild(doneBtn);

  const blockEls: Record<StarPart, { el: HTMLDivElement; notes: HTMLDivElement }> = {} as never;
  for (const part of PART_ORDER) {
    const el = document.createElement("div");
    el.className = "sv-block";
    const label = document.createElement("div");
    label.className = "sv-block-label";
    label.textContent = PART_LABEL[part];
    const notes = document.createElement("div");
    notes.className = "sv-block-notes";
    el.append(label, notes);
    blocks.appendChild(el);
    blockEls[part] = { el, notes };
  }

  let usingCustomPos = false;

  function reposition() {
    if (usingCustomPos) return; // the user has dragged it; stop auto-placing on resize
    const stage = computeStage(window.innerWidth, window.innerHeight);
    panel.style.left = `${stage.x}px`;
    panel.style.top = `${stage.y + stage.h + 12}px`;
    panel.style.width = `${stage.w}px`;
  }
  reposition();
  window.addEventListener("resize", reposition);

  // Free drag-to-reposition, same pattern as apps/vennmeet's private
  // layer — persisted in chrome.storage.local so it stays put next
  // session. Dropping the stage-relative width once dragged lets the
  // panel size itself to its own content instead of a now-unrelated band.
  const dragCtl = attachDragHandle(panel, dragHandle, (pos) => {
    usingCustomPos = true;
    panel.style.width = "auto";
    void chrome.storage.local.set({ [STAGE_POS_KEY]: pos });
  });
  void chrome.storage.local.get(STAGE_POS_KEY).then((result) => {
    const stored = result[STAGE_POS_KEY] as { x: number; y: number } | undefined;
    if (!stored) return;
    usingCustomPos = true;
    panel.style.width = "auto";
    applyPanelPosition(panel, stored);
  });

  return {
    setCovered(part, covered) {
      blockEls[part].el.classList.toggle("sv-covered", covered);
    },
    setNotes(part, text) {
      blockEls[part].notes.textContent = text;
    },
    setElapsedSeconds(seconds) {
      elapsedEl.textContent = formatElapsed(seconds);
    },
    setFillerCount(count) {
      fillerEl.textContent = `${count} filler${count === 1 ? "" : "s"}`;
    },
    onDone(cb) {
      doneBtn.addEventListener("click", cb, { once: true });
    },
    destroy() {
      window.removeEventListener("resize", reposition);
      dragCtl.destroy();
      layer.destroy();
    },
  };
}
