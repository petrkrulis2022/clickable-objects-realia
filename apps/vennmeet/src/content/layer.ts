import type { Card, Deck, LayerPrefs } from "@vennmeet/shared";
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
`;

export interface LayerHandle {
  root: ShadowRoot;
  setDeck(deck: Deck): void;
  setPrefs(prefs: LayerPrefs): void;
  toggleCollapse(): void;
  onChecklistToggle(cb: (cardId: string, itemIndex: number) => void): void;
  /** Fires on every collapse-state change, however it was triggered (hotkey, collapse button, or clicking the collapsed tab to reopen). */
  onCollapseChange(cb: (collapsed: boolean) => void): void;
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

  function setDeck(deck: Deck) {
    currentDeck = deck;
    currentSectionIndex = 0;
    renderTabs();
    renderSection();
  }

  function setPrefs(prefs: LayerPrefs) {
    panel.dataset.dock = prefs.dock;
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
    destroy: () => host.remove(),
  };
}
