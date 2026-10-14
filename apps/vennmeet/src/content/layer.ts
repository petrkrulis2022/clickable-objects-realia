import type { Card, Debrief, Deck, LayerPrefs } from "@vennmeet/shared";
import {
  CARD_TEXT_SIZE_PX,
  CARD_TEXT_WEIGHT,
  CARD_TEXT_LINE_HEIGHT,
  CARD_TEXT_COLOR,
  CARD_TITLE_FONT_SIZE_PX,
  CARD_TITLE_COLOR,
  CARD_TITLE_LETTER_SPACING,
  CHECKLIST_TICKBOX_PX,
  CHECKLIST_DONE_OPACITY,
  COLLAPSE_TAB_PX,
  DECISION_META_FONT_SIZE_PX,
  NUMBER_FIGURE_FONT_SIZE_PX,
  NUMBER_SPOKEN_FONT_SIZE_PX,
  PANEL_BG,
  PANEL_RADIUS_PX,
  PANEL_SHADOW,
  PRIVATE_DOCK_MAX_VH_FRACTION,
  PRIVATE_DOCK_TOP_PX,
  PRIVATE_DOCK_WIDTH_PX,
  SECTION_TAB_FONT_SIZE_PX,
  SECTION_TAB_WEIGHT,
  SHARED_ACCENT_COLOR,
  SHARED_ACCENT_RULE_PX,
  SYSTEM_FONT_STACK,
  Z_INDEX_MAX,
} from "./design";

const CSS = `
  :host { all: initial; }
  .venn-root {
    position: fixed;
    inset: 0;
    z-index: ${Z_INDEX_MAX};
    pointer-events: none;
    font-family: ${SYSTEM_FONT_STACK};
  }
  .venn-root.venn-sharing { display: none; }
  .venn-panel {
    position: absolute;
    box-sizing: border-box;
    width: ${PRIVATE_DOCK_WIDTH_PX}px;
    max-height: ${PRIVATE_DOCK_MAX_VH_FRACTION * 100}vh;
    background: ${PANEL_BG};
    border-radius: ${PANEL_RADIUS_PX}px;
    box-shadow: ${PANEL_SHADOW};
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: opacity 120ms linear;
  }
  .venn-panel[data-dock="top"] { top: ${PRIVATE_DOCK_TOP_PX}px; left: 50%; transform: translateX(-50%); }
  .venn-panel[data-dock="left"] { top: 15vh; left: 24px; }
  .venn-panel[data-dock="right"] { top: 15vh; right: 24px; }

  .venn-panel.venn-collapsed {
    width: ${COLLAPSE_TAB_PX}px;
    height: ${COLLAPSE_TAB_PX}px;
    max-height: none;
    border-radius: 8px;
    cursor: pointer;
  }
  .venn-panel.venn-collapsed[data-dock="top"] { transform: translateX(-50%); }
  .venn-panel.venn-collapsed .venn-body { display: none; }
  .venn-panel.venn-collapsed .venn-collapse-btn { width: 100%; height: 100%; }

  .venn-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 10px 0;
    flex-shrink: 0;
  }
  .venn-tab {
    font-size: ${SECTION_TAB_FONT_SIZE_PX}px;
    font-weight: ${SECTION_TAB_WEIGHT};
    color: #9a9a9a;
    background: transparent;
    border: none;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
  }
  .venn-tab.venn-tab-active { color: ${SHARED_ACCENT_COLOR}; background: rgba(124,92,255,0.12); }

  .venn-body {
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .venn-card {
    background: rgba(255,255,255,0.04);
    border-radius: 10px;
    padding: 10px 12px;
    position: relative;
  }
  .venn-card.venn-shared {
    border-left: ${SHARED_ACCENT_RULE_PX}px solid ${SHARED_ACCENT_COLOR};
  }
  .venn-card-title {
    font-size: ${CARD_TITLE_FONT_SIZE_PX}px;
    text-transform: uppercase;
    letter-spacing: ${CARD_TITLE_LETTER_SPACING};
    color: ${CARD_TITLE_COLOR};
    margin-bottom: 4px;
  }
  .venn-card-text, .venn-card-line {
    font-weight: ${CARD_TEXT_WEIGHT};
    line-height: ${CARD_TEXT_LINE_HEIGHT};
    color: ${CARD_TEXT_COLOR};
  }
  .venn-card-list { margin: 0; padding-left: 18px; }
  .venn-card-list li { font-weight: ${CARD_TEXT_WEIGHT}; line-height: ${CARD_TEXT_LINE_HEIGHT}; color: ${CARD_TEXT_COLOR}; }

  .venn-checklist-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    cursor: pointer;
  }
  .venn-checklist-item.venn-done { opacity: ${CHECKLIST_DONE_OPACITY}; }
  .venn-tickbox {
    width: ${CHECKLIST_TICKBOX_PX}px;
    height: ${CHECKLIST_TICKBOX_PX}px;
    flex-shrink: 0;
    border-radius: 5px;
    border: 2px solid #777;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
  }
  .venn-checklist-item.venn-done .venn-tickbox { background: ${SHARED_ACCENT_COLOR}; border-color: ${SHARED_ACCENT_COLOR}; }

  .venn-number-figure { font-size: ${NUMBER_FIGURE_FONT_SIZE_PX}px; font-weight: 600; color: ${CARD_TEXT_COLOR}; }
  .venn-number-spoken { font-size: ${NUMBER_SPOKEN_FONT_SIZE_PX}px; color: #9a9a9a; margin-top: 2px; }

  .venn-goal-want { font-weight: ${CARD_TEXT_WEIGHT}; line-height: ${CARD_TEXT_LINE_HEIGHT}; color: ${CARD_TEXT_COLOR}; }
  .venn-goal-walkaway { font-size: 13px; color: #c97b7b; margin-top: 4px; }

  .venn-meta { font-size: ${DECISION_META_FONT_SIZE_PX}px; color: #9a9a9a; margin-top: 4px; }

  .venn-collapse-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    border: none;
    background: rgba(255,255,255,0.08);
    color: #ccc;
    font-size: 11px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .venn-drag-handle {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    border: none;
    background: rgba(255,255,255,0.08);
    color: #ccc;
    font-size: 12px;
    line-height: 20px;
    text-align: center;
    cursor: grab;
    flex-shrink: 0;
    touch-action: none;
  }
  .venn-drag-handle.venn-dragging { cursor: grabbing; }
  .venn-panel.venn-collapsed .venn-drag-handle { display: none; }

  .venn-end-session-btn {
    position: absolute;
    top: 8px;
    right: 32px;
    padding: 2px 8px;
    border-radius: 5px;
    border: none;
    background: rgba(255,255,255,0.08);
    color: #ccc;
    font-size: 10px;
    cursor: pointer;
  }
  .venn-panel.venn-collapsed .venn-end-session-btn { display: none; }

  .venn-debrief-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: none;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
  }
  .venn-debrief-overlay.venn-open { display: flex; }
  .venn-debrief-modal {
    width: 360px;
    background: ${PANEL_BG};
    border-radius: ${PANEL_RADIUS_PX}px;
    box-shadow: ${PANEL_SHADOW};
    padding: 20px;
  }
  .venn-debrief-modal h3 { margin: 0 0 12px; font-size: 16px; color: #fff; }
  .venn-debrief-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .venn-debrief-field span { font-size: 12px; color: #9a9a9a; }
  .venn-debrief-field textarea {
    font: inherit;
    font-size: 13px;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid #3a3a3d;
    background: #111;
    color: #fff;
    resize: vertical;
    min-height: 44px;
  }
  .venn-debrief-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  .venn-btn {
    font: inherit;
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 6px;
    border: none;
    background: #3a3a3d;
    color: #fff;
    cursor: pointer;
  }
  .venn-btn-primary { background: ${SHARED_ACCENT_COLOR}; }
`;

export interface LayerHandle {
  root: ShadowRoot;
  setDeck(deck: Deck): void;
  setPrefs(prefs: LayerPrefs): void;
  toggleCollapse(): void;
  onChecklistToggle(cb: (cardId: string, itemIndex: number) => void): void;
  /** Fires on every collapse-state change, however it was triggered (hotkey, collapse button, or clicking the collapsed tab to reopen). */
  onCollapseChange(cb: (collapsed: boolean) => void): void;
  /** Fires once per drag, when the user releases the drag handle — the new position, in viewport pixels. */
  onPositionChange(cb: (pos: { x: number; y: number }) => void): void;
  /** Hides the layer entirely, collapsed tab included, independent of collapse state — for screen share (docs/SPEC-VENNMEET.md, "3. Hide on screen share"). */
  setSharing(sharing: boolean): void;
  /** Called when the teacher/user clicks "End session" — the debrief prompt's trigger (docs/SPEC-VENNMEET.md, "6. Minutes, debrief and onboarding"). */
  onEndSession(cb: (debrief: Debrief | null) => void): void;
  destroy(): void;
}

function renderCard(card: Card): HTMLElement {
  const el = document.createElement("div");
  el.className = "venn-card";
  if (card.kind === "decision" || card.kind === "action") el.classList.add("venn-shared");

  switch (card.kind) {
    case "phrase": {
      if (card.title) el.appendChild(titleEl(card.title));
      const text = document.createElement("div");
      text.className = "venn-card-text";
      text.textContent = card.text;
      el.appendChild(text);
      break;
    }
    case "list": {
      el.appendChild(titleEl(card.title));
      const ul = document.createElement("ul");
      ul.className = "venn-card-list";
      for (const line of card.lines) {
        const li = document.createElement("li");
        li.textContent = line;
        ul.appendChild(li);
      }
      el.appendChild(ul);
      break;
    }
    case "checklist": {
      el.appendChild(titleEl(card.title));
      card.items.forEach((item, i) => {
        const row = document.createElement("div");
        row.className = "venn-checklist-item" + (item.done ? " venn-done" : "");
        row.dataset.cardId = card.id;
        row.dataset.itemIndex = String(i);
        const box = document.createElement("div");
        box.className = "venn-tickbox";
        box.textContent = item.done ? "✓" : "";
        const label = document.createElement("div");
        label.className = "venn-card-line";
        label.textContent = item.text;
        row.append(box, label);
        el.appendChild(row);
      });
      break;
    }
    case "number": {
      el.appendChild(titleEl(card.title));
      const figure = document.createElement("div");
      figure.className = "venn-number-figure";
      figure.textContent = card.value;
      el.appendChild(figure);
      if (card.spoken) {
        const spoken = document.createElement("div");
        spoken.className = "venn-number-spoken";
        spoken.textContent = card.spoken;
        el.appendChild(spoken);
      }
      break;
    }
    case "note": {
      el.appendChild(titleEl(card.title));
      const text = document.createElement("div");
      text.className = "venn-card-text";
      text.textContent = card.text;
      el.appendChild(text);
      break;
    }
    case "goal": {
      el.appendChild(titleEl(card.title));
      const want = document.createElement("div");
      want.className = "venn-goal-want";
      want.textContent = card.want;
      el.appendChild(want);
      if (card.walkAway) {
        const walk = document.createElement("div");
        walk.className = "venn-goal-walkaway";
        walk.textContent = `Walk away: ${card.walkAway}`;
        el.appendChild(walk);
      }
      break;
    }
    case "decision": {
      const text = document.createElement("div");
      text.className = "venn-card-text";
      text.textContent = card.text;
      const meta = document.createElement("div");
      meta.className = "venn-meta";
      meta.textContent = `Agreed by ${card.agreedBy} · ${new Date(card.at).toLocaleString()}`;
      el.append(text, meta);
      break;
    }
    case "action": {
      const text = document.createElement("div");
      text.className = "venn-card-text";
      text.textContent = card.text;
      const meta = document.createElement("div");
      meta.className = "venn-meta";
      meta.textContent = `${card.owner}${card.due ? ` · due ${card.due}` : ""}`;
      el.append(text, meta);
      break;
    }
  }

  return el;
}

function titleEl(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "venn-card-title";
  el.textContent = text;
  return el;
}

/**
 * The private layer (docs/SPEC-VENNMEET.md, "Your private layer" +
 * "Design"). One root element in document.body behind an open shadow
 * root — never queries, reads or attaches to the host platform's DOM,
 * so identical code runs on every platform.
 */
export function mountLayer(): LayerHandle {
  const host = document.createElement("div");
  host.id = "venn-layer-root";
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);

  const rootEl = document.createElement("div");
  rootEl.className = "venn-root";
  root.appendChild(rootEl);

  const panel = document.createElement("div");
  panel.className = "venn-panel";
  rootEl.appendChild(panel);

  const collapseBtn = document.createElement("button");
  collapseBtn.className = "venn-collapse-btn";
  collapseBtn.textContent = "‖";
  panel.appendChild(collapseBtn);

  // Free drag-to-reposition (docs/SPEC-VENNMEET.md doesn't specify
  // this; added on request so the private layer can go anywhere on
  // screen, not just the three dock presets). A dedicated handle
  // rather than the whole panel, so dragging never fights with
  // clicking a tab, a checklist item, or the collapse button.
  const dragHandle = document.createElement("button");
  dragHandle.className = "venn-drag-handle";
  dragHandle.textContent = "⠿";
  dragHandle.title = "Drag to move";
  panel.appendChild(dragHandle);

  const endSessionBtn = document.createElement("button");
  endSessionBtn.className = "venn-end-session-btn";
  endSessionBtn.textContent = "End session";
  panel.appendChild(endSessionBtn);

  const debriefOverlay = document.createElement("div");
  debriefOverlay.className = "venn-debrief-overlay";
  const debriefModal = document.createElement("div");
  debriefModal.className = "venn-debrief-modal";
  debriefOverlay.appendChild(debriefModal);
  rootEl.appendChild(debriefOverlay);

  const debriefTitle = document.createElement("h3");
  debriefTitle.textContent = "Before you go";
  debriefModal.appendChild(debriefTitle);

  function debriefField(label: string): { wrap: HTMLElement; input: HTMLTextAreaElement } {
    const wrap = document.createElement("label");
    wrap.className = "venn-debrief-field";
    const span = document.createElement("span");
    span.textContent = label;
    const input = document.createElement("textarea");
    wrap.append(span, input);
    return { wrap, input };
  }
  const surprised = debriefField("What surprised me");
  const better = debriefField("What I'd say better");
  const followUp = debriefField("What I need to follow up");
  debriefModal.append(surprised.wrap, better.wrap, followUp.wrap);

  const debriefButtons = document.createElement("div");
  debriefButtons.className = "venn-debrief-buttons";
  const skipBtn = document.createElement("button");
  skipBtn.className = "venn-btn";
  skipBtn.textContent = "Skip";
  const saveBtn = document.createElement("button");
  saveBtn.className = "venn-btn venn-btn-primary";
  saveBtn.textContent = "Save";
  debriefButtons.append(skipBtn, saveBtn);
  debriefModal.appendChild(debriefButtons);

  const tabs = document.createElement("div");
  tabs.className = "venn-tabs";
  panel.appendChild(tabs);

  const body = document.createElement("div");
  body.className = "venn-body";
  panel.appendChild(body);

  document.body.appendChild(host);

  let currentDeck: Deck | null = null;
  let currentSectionIndex = 0;
  let collapsed = false;
  let checklistCb: ((cardId: string, itemIndex: number) => void) | null = null;
  let collapseCb: ((collapsed: boolean) => void) | null = null;
  let positionCb: ((pos: { x: number; y: number }) => void) | null = null;

  function renderSection() {
    body.innerHTML = "";
    const section = currentDeck?.sections[currentSectionIndex];
    if (!section) return;
    const sizeKey = (panel.dataset.size as "S" | "M" | "L" | undefined) ?? "M";
    body.style.fontSize = `${CARD_TEXT_SIZE_PX[sizeKey]}px`;
    for (const card of section.cards) {
      body.appendChild(renderCard(card));
    }
  }

  function renderTabs() {
    tabs.innerHTML = "";
    if (!currentDeck) return;
    currentDeck.sections.forEach((section, i) => {
      const btn = document.createElement("button");
      btn.className = "venn-tab" + (i === currentSectionIndex ? " venn-tab-active" : "");
      btn.textContent = section.title;
      btn.addEventListener("click", () => {
        currentSectionIndex = i;
        renderTabs();
        renderSection();
      });
      tabs.appendChild(btn);
    });
  }

  body.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest(".venn-checklist-item") as HTMLElement | null;
    if (!row) return;
    const cardId = row.dataset.cardId!;
    const itemIndex = Number(row.dataset.itemIndex);
    checklistCb?.(cardId, itemIndex);
  });

  function setCollapsed(next: boolean) {
    const changed = next !== collapsed;
    collapsed = next;
    panel.classList.toggle("venn-collapsed", collapsed);
    if (changed) collapseCb?.(collapsed);
  }

  collapseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setCollapsed(!collapsed);
  });
  panel.addEventListener("click", () => {
    if (collapsed) setCollapsed(false);
  });

  function clampToViewport(x: number, y: number): { x: number; y: number } {
    const rect = panel.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const maxY = Math.max(0, window.innerHeight - rect.height);
    return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
  }

  /** Switches the panel onto free pixel positioning — "custom" matches no `[data-dock]` CSS rule, so nothing fights the inline left/top. */
  function applyPosition(pos: { x: number; y: number }) {
    panel.dataset.dock = "custom";
    panel.style.transform = "none";
    panel.style.right = "auto";
    panel.style.left = `${pos.x}px`;
    panel.style.top = `${pos.y}px`;
  }

  let dragOffset: { x: number; y: number } | null = null;

  dragHandle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    const rect = panel.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    dragHandle.classList.add("venn-dragging");
    dragHandle.setPointerCapture(e.pointerId);
  });
  dragHandle.addEventListener("pointermove", (e) => {
    if (!dragOffset) return;
    applyPosition(clampToViewport(e.clientX - dragOffset.x, e.clientY - dragOffset.y));
  });
  function endDrag(e: PointerEvent) {
    if (!dragOffset) return;
    const pos = clampToViewport(e.clientX - dragOffset.x, e.clientY - dragOffset.y);
    applyPosition(pos);
    dragOffset = null;
    dragHandle.classList.remove("venn-dragging");
    dragHandle.releasePointerCapture(e.pointerId);
    positionCb?.(pos);
  }
  dragHandle.addEventListener("pointerup", endDrag);
  dragHandle.addEventListener("pointercancel", endDrag);

  let endSessionCb: ((debrief: Debrief | null) => void) | null = null;

  endSessionBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    surprised.input.value = "";
    better.input.value = "";
    followUp.input.value = "";
    debriefOverlay.classList.add("venn-open");
  });
  skipBtn.addEventListener("click", () => {
    debriefOverlay.classList.remove("venn-open");
    endSessionCb?.(null);
  });
  saveBtn.addEventListener("click", () => {
    debriefOverlay.classList.remove("venn-open");
    endSessionCb?.({
      surprised: surprised.input.value,
      better: better.input.value,
      followUp: followUp.input.value,
      at: new Date().toISOString(),
    });
  });

  function setDeck(deck: Deck) {
    currentDeck = deck;
    currentSectionIndex = 0;
    renderTabs();
    renderSection();
  }

  function setSharing(sharing: boolean) {
    rootEl.classList.toggle("venn-sharing", sharing);
  }

  function setPrefs(prefs: LayerPrefs) {
    if (prefs.posPx) applyPosition(prefs.posPx);
    else panel.dataset.dock = prefs.dock;
    panel.dataset.size = prefs.size;
    panel.style.opacity = String(prefs.opacity);
    setCollapsed(prefs.collapsed.private);
    renderSection();
  }

  return {
    root,
    setDeck,
    setPrefs,
    toggleCollapse: () => setCollapsed(!collapsed),
    onChecklistToggle: (cb) => {
      checklistCb = cb;
    },
    onCollapseChange: (cb) => {
      collapseCb = cb;
    },
    onPositionChange: (cb) => {
      positionCb = cb;
    },
    setSharing,
    onEndSession: (cb) => {
      endSessionCb = cb;
    },
    destroy: () => host.remove(),
  };
}
