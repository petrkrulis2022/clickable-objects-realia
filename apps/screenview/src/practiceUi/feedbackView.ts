import type { StarSplitPart } from "@screenview/shared";
import { mountShadowLayer, type ShadowLayer } from "@overlay/shared";
import { GAP_COLOR, PANEL_BG, PANEL_RADIUS_PX, PANEL_SHADOW, SYSTEM_FONT_STACK, TEXT_COLOR, THIN_COLOR } from "../content/design";

export interface FeedbackViewHandlers {
  onAnswerAgain(): void;
  onNextQuestion(): void;
  onEndSession(): void;
}

/**
 * "Render it back as objects... they can drag the parts into a better
 * order... the primary action on that screen is 'Answer it again'"
 * (docs/SPEC-SCREENVIEW.md, "5. Feedback and the retry"). Shows the
 * candidate's own transcript, split by STAR element — never anything
 * generated. `priorAttempt` is passed on attempt 2+ so the two are
 * comparable side by side.
 */
export function mountFeedbackView(
  parts: StarSplitPart[],
  fillerCount: number,
  totalSeconds: number,
  attemptNumber: number,
  priorAttempt: { parts: StarSplitPart[]; fillerCount: number; totalSeconds: number } | null,
  handlers: FeedbackViewHandlers,
): { destroy(): void } {
  const layer: ShadowLayer = mountShadowLayer("screenview-feedback-host", "screenview-feedback-layer");

  const style = document.createElement("style");
  style.textContent = `
    .sv-fb-layer { pointer-events: auto; display: flex; align-items: center; justify-content: center; }
    .sv-fb-panel {
      font-family: ${SYSTEM_FONT_STACK};
      color: ${TEXT_COLOR};
      background: ${PANEL_BG};
      border-radius: ${PANEL_RADIUS_PX}px;
      box-shadow: ${PANEL_SHADOW};
      padding: 20px 24px;
      max-width: 640px;
      width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
    }
    .sv-fb-heading { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
    .sv-fb-heading h2 { font-size: 16px; margin: 0; }
    .sv-fb-meta { font-size: 13px; opacity: 0.8; }
    .sv-fb-cards { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .sv-fb-card { border: 2px solid rgba(255,255,255,0.15); border-radius: 10px; padding: 10px 12px; cursor: grab; }
    .sv-fb-card.sv-missing { border-color: ${GAP_COLOR}; }
    .sv-fb-card.sv-thin { border-color: ${THIN_COLOR}; }
    .sv-fb-card-top { display: flex; justify-content: space-between; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
    .sv-fb-card-text { font-size: 13px; margin-top: 6px; }
    .sv-fb-card-text.sv-empty { font-style: italic; opacity: 0.6; }
    .sv-fb-prior { font-size: 12px; opacity: 0.6; margin-top: 4px; }
    .sv-fb-actions { display: flex; gap: 10px; align-items: center; }
    .sv-fb-btn { font-family: inherit; font-size: 14px; border-radius: 6px; padding: 8px 14px; border: 1px solid rgba(255,255,255,0.2); background: #2e2e31; color: ${TEXT_COLOR}; cursor: pointer; }
    .sv-fb-btn:hover { background: #3a3a3d; }
    .sv-fb-btn-primary { background: #3a6ee8; border-color: #3a6ee8; font-weight: 600; flex: 1; }
    .sv-fb-btn-primary:hover { background: #4a7bf0; }
  `;
  layer.root.appendChild(style);
  layer.layerEl.classList.add("sv-fb-layer");

  const panel = document.createElement("div");
  panel.className = "sv-fb-panel";
  layer.layerEl.appendChild(panel);

  const heading = document.createElement("div");
  heading.className = "sv-fb-heading";
  const h2 = document.createElement("h2");
  h2.textContent = `Attempt ${attemptNumber}`;
  const meta = document.createElement("div");
  meta.className = "sv-fb-meta";
  meta.textContent = `${Math.round(totalSeconds)}s · ${fillerCount} filler${fillerCount === 1 ? "" : "s"}`;
  heading.append(h2, meta);
  panel.appendChild(heading);

  if (priorAttempt) {
    const compare = document.createElement("div");
    compare.className = "sv-fb-meta";
    compare.textContent = `Attempt ${attemptNumber - 1}: ${Math.round(priorAttempt.totalSeconds)}s · ${priorAttempt.fillerCount} fillers`;
    panel.appendChild(compare);
  }

  const cardsEl = document.createElement("div");
  cardsEl.className = "sv-fb-cards";
  panel.appendChild(cardsEl);

  let order = [...parts];
  let dragFromIndex: number | null = null;

  function render() {
    cardsEl.innerHTML = "";
    order.forEach((part, index) => {
      const card = document.createElement("div");
      card.className = "sv-fb-card" + (!part.covered ? " sv-missing" : part.thin ? " sv-thin" : "");
      card.draggable = true;

      const top = document.createElement("div");
      top.className = "sv-fb-card-top";
      const label = document.createElement("span");
      label.textContent = part.part;
      const status = document.createElement("span");
      status.textContent = !part.covered ? "missing" : part.thin ? `thin · ${Math.round(part.seconds)}s` : `${Math.round(part.seconds)}s`;
      top.append(label, status);
      card.appendChild(top);

      const text = document.createElement("div");
      text.className = "sv-fb-card-text" + (!part.covered ? " sv-empty" : "");
      text.textContent = part.covered ? part.text : "Not mentioned in this answer.";
      card.appendChild(text);

      const prior = priorAttempt?.parts.find((p) => p.part === part.part);
      if (prior) {
        const priorEl = document.createElement("div");
        priorEl.className = "sv-fb-prior";
        priorEl.textContent = `Last time: ${prior.covered ? `${Math.round(prior.seconds)}s` : "missing"}`;
        card.appendChild(priorEl);
      }

      card.addEventListener("dragstart", () => {
        dragFromIndex = index;
      });
      card.addEventListener("dragover", (e) => e.preventDefault());
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dragFromIndex === null || dragFromIndex === index) return;
        const [moved] = order.splice(dragFromIndex, 1);
        order.splice(index, 0, moved);
        dragFromIndex = null;
        render();
      });

      cardsEl.appendChild(card);
    });
  }
  render();

  const actions = document.createElement("div");
  actions.className = "sv-fb-actions";
  const againBtn = document.createElement("button");
  againBtn.className = "sv-fb-btn sv-fb-btn-primary";
  againBtn.textContent = "Answer it again";
  againBtn.addEventListener("click", () => handlers.onAnswerAgain());
  const nextBtn = document.createElement("button");
  nextBtn.className = "sv-fb-btn";
  nextBtn.textContent = "Next question";
  nextBtn.addEventListener("click", () => handlers.onNextQuestion());
  const endBtn = document.createElement("button");
  endBtn.className = "sv-fb-btn";
  endBtn.textContent = "End session";
  endBtn.addEventListener("click", () => handlers.onEndSession());
  actions.append(againBtn, nextBtn, endBtn);
  panel.appendChild(actions);

  return { destroy: () => layer.destroy() };
}
