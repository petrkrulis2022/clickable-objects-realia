import type { Card, CardKind, Id, SharedCard, SharedRoom } from "@vennmeet/shared";
import {
  PANEL_BG,
  PANEL_RADIUS_PX,
  PANEL_SHADOW,
  SHARED_ACCENT_COLOR,
  SHARED_ACCENT_RULE_PX,
  SHARED_DOCK_MAX_VH_FRACTION,
  SHARED_DOCK_WIDTH_PX,
  SYSTEM_FONT_STACK,
  Z_INDEX_MAX,
} from "./design";

const CSS = `
  .venn-shared-root {
    position: fixed;
    inset: 0;
    z-index: ${Z_INDEX_MAX - 1};
    pointer-events: none;
    font-family: ${SYSTEM_FONT_STACK};
  }
  .venn-shared-panel {
    position: absolute;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    width: ${SHARED_DOCK_WIDTH_PX}px;
    max-height: ${SHARED_DOCK_MAX_VH_FRACTION * 100}vh;
    background: ${PANEL_BG};
    border-radius: ${PANEL_RADIUS_PX}px;
    box-shadow: ${PANEL_SHADOW};
    pointer-events: auto;
    display: none;
    flex-direction: column;
    overflow: hidden;
  }
  .venn-shared-panel.venn-open { display: flex; }

  .venn-shared-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .venn-shared-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #ccc;
  }
  .venn-shared-indicator::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${SHARED_ACCENT_COLOR};
  }
  .venn-presence { display: flex; gap: 4px; }
  .venn-presence-chip {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(124,92,255,0.18);
    color: ${SHARED_ACCENT_COLOR};
  }

  .venn-shared-stage {
    position: relative;
    flex: 1;
    overflow: auto;
    padding: 12px;
    min-height: 120px;
  }
  .venn-shared-card {
    position: absolute;
    min-width: 160px;
    max-width: 240px;
    background: rgba(255,255,255,0.05);
    border-left: ${SHARED_ACCENT_RULE_PX}px solid ${SHARED_ACCENT_COLOR};
    border-radius: 8px;
    padding: 8px 10px;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .venn-shared-card.venn-held { cursor: grabbing; box-shadow: 0 6px 16px rgba(0,0,0,0.4); }
  .venn-shared-card .venn-card-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #9a9a9a; margin-bottom: 2px; }
  .venn-shared-card .venn-card-text { font-size: 14px; color: #f2f2f2; }
  .venn-shared-card .venn-card-meta { font-size: 11px; color: #9a9a9a; margin-top: 4px; }
  .venn-shared-card .venn-pin-btn, .venn-shared-card .venn-remove-btn {
    position: absolute;
    top: 4px;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 4px;
    background: rgba(255,255,255,0.1);
    color: #ccc;
    font-size: 10px;
    cursor: pointer;
  }
  .venn-shared-card .venn-pin-btn { right: 22px; }
  .venn-shared-card .venn-remove-btn { right: 4px; }
  .venn-shared-card.venn-pinned { border-left-color: #d9a441; }

  .venn-add-card-row { padding: 8px 12px; display: flex; gap: 6px; flex-shrink: 0; border-top: 1px solid rgba(255,255,255,0.08); }
  .venn-add-card-row select {
    font: inherit;
    font-size: 12px;
    background: #111;
    color: #fff;
    border: 1px solid #3a3a3d;
    border-radius: 5px;
  }
  .venn-add-card-row .venn-btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 5px;
    border: none;
    background: ${SHARED_ACCENT_COLOR};
    color: #fff;
    cursor: pointer;
  }
`;

export interface SharedLayerCallbacks {
  onMove: (id: Id, pos: { x: number; y: number }) => void;
  onPut: (card: Card) => void;
  onPin: (id: Id) => void;
  onRemove: (id: Id) => void;
}

export interface SharedLayerHandle {
  setOpen(open: boolean): void;
  setRoom(room: SharedRoom): void;
  applyPatch(changed: SharedCard[], removed: Id[]): void;
  setPresent(present: SharedRoom["present"]): void;
  setMyName(name: string): void;
  destroy(): void;
}

function genId(): string {
  return crypto.randomUUID();
}

/**
 * The shared layer (docs/SPEC-VENNMEET.md, "The shared layer" +
 * "Design"): lower third, visually distinct from the private layer
 * (accent rule + presence chip), free-form draggable cards with the
 * relay's soft lock. Mounted into the SAME shadow root as the private
 * layer (passed in), not a second shadow host.
 */
export function mountSharedLayer(root: ShadowRoot, callbacks: SharedLayerCallbacks): SharedLayerHandle {
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);

  const rootEl = document.createElement("div");
  rootEl.className = "venn-shared-root";
  root.appendChild(rootEl);

  const panel = document.createElement("div");
  panel.className = "venn-shared-panel";
  rootEl.appendChild(panel);

  const header = document.createElement("div");
  header.className = "venn-shared-header";
  const indicator = document.createElement("div");
  indicator.className = "venn-shared-indicator";
  indicator.textContent = "Shared layer open";
  const presenceEl = document.createElement("div");
  presenceEl.className = "venn-presence";
  header.append(indicator, presenceEl);
  panel.appendChild(header);

  const stage = document.createElement("div");
  stage.className = "venn-shared-stage";
  panel.appendChild(stage);

  const addRow = document.createElement("div");
  addRow.className = "venn-add-card-row";
  const kindSelect = document.createElement("select");
  for (const kind of ["phrase", "list", "checklist", "number", "note", "goal", "decision", "action"] as CardKind[]) {
    const opt = document.createElement("option");
    opt.value = kind;
    opt.textContent = kind;
    kindSelect.appendChild(opt);
  }
  const addBtn = document.createElement("button");
  addBtn.className = "venn-btn";
  addBtn.textContent = "+ Add card";
  addRow.append(kindSelect, addBtn);
  panel.appendChild(addRow);

  let myName = "";
  let cardEls = new Map<Id, HTMLElement>();
  let draggingId: Id | null = null;
  let lastClientX = 0;
  let lastClientY = 0;

  function emptyCard(kind: CardKind): Card {
    switch (kind) {
      case "phrase":
        return { id: genId(), kind, text: "New phrase" };
      case "list":
        return { id: genId(), kind, title: "List", lines: [] };
      case "checklist":
        return { id: genId(), kind, title: "Checklist", items: [] };
      case "number":
        return { id: genId(), kind, title: "Number", value: "" };
      case "note":
        return { id: genId(), kind, title: "Note", text: "New note" };
      case "goal":
        return { id: genId(), kind, title: "Goal", want: "" };
      case "decision":
        return { id: genId(), kind, text: "New decision", agreedBy: myName, at: new Date().toISOString() };
      case "action":
        return { id: genId(), kind, text: "New action", owner: myName };
    }
  }

  addBtn.addEventListener("click", () => callbacks.onPut(emptyCard(kindSelect.value as CardKind)));

  function cardLabel(card: SharedCard): { title: string; text: string; meta?: string } {
    switch (card.kind) {
      case "phrase":
        return { title: "Phrase", text: card.text };
      case "note":
        return { title: card.title, text: card.text };
      case "list":
        return { title: card.title, text: card.lines.join(", ") };
      case "checklist":
        return { title: card.title, text: card.items.map((i) => i.text).join(", ") };
      case "number":
        return { title: card.title, text: card.value };
      case "goal":
        return { title: card.title, text: card.want };
      case "decision":
        return { title: "Decision", text: card.text, meta: `${card.agreedBy} · ${new Date(card.at).toLocaleString()}` };
      case "action":
        return { title: "Action", text: card.text, meta: `${card.owner}${card.due ? ` · due ${card.due}` : ""}` };
    }
  }

  function buildCardEl(card: SharedCard): HTMLElement {
    const el = document.createElement("div");
    el.className = "venn-shared-card";
    el.dataset.id = card.id;

    const pinBtn = document.createElement("button");
    pinBtn.className = "venn-pin-btn";
    pinBtn.textContent = "\u{1F4CC}";
    pinBtn.title = "Pin";
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onPin(card.id);
    });
    el.appendChild(pinBtn);

    const removeBtn = document.createElement("button");
    removeBtn.className = "venn-remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.onRemove(card.id);
    });
    el.appendChild(removeBtn);

    const title = document.createElement("div");
    title.className = "venn-card-title";
    el.appendChild(title);
    const text = document.createElement("div");
    text.className = "venn-card-text";
    el.appendChild(text);
    const meta = document.createElement("div");
    meta.className = "venn-card-meta";
    el.appendChild(meta);

    el.addEventListener("pointerdown", (e) => onPointerDown(e, card.id));
    return el;
  }

  function layoutCard(card: SharedCard, el: HTMLElement) {
    const { title, text, meta } = cardLabel(card);
    (el.querySelector(".venn-card-title") as HTMLElement).textContent = title;
    (el.querySelector(".venn-card-text") as HTMLElement).textContent = text;
    (el.querySelector(".venn-card-meta") as HTMLElement).textContent = meta ?? "";
    const pos = card.pos ?? { x: 0.05, y: 0.05 };
    el.style.left = `${pos.x * 100}%`;
    el.style.top = `${pos.y * 100}%`;
    el.classList.toggle("venn-held", !!card.heldBy);
    el.classList.toggle("venn-pinned", !!card.pinnedBy);
  }

  function onPointerDown(e: PointerEvent, id: Id) {
    const el = cardEls.get(id);
    if (!el) return;
    draggingId = id;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.classList.add("venn-held");
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (!draggingId) return;
    const el = cardEls.get(draggingId);
    if (!el) return;
    const rect = stage.getBoundingClientRect();
    const dxFrac = (e.clientX - lastClientX) / rect.width;
    const dyFrac = (e.clientY - lastClientY) / rect.height;
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    const currentLeft = parseFloat(el.style.left) / 100;
    const currentTop = parseFloat(el.style.top) / 100;
    const next = {
      x: Math.min(Math.max(currentLeft + dxFrac, 0), 0.95),
      y: Math.min(Math.max(currentTop + dyFrac, 0), 0.9),
    };
    el.style.left = `${next.x * 100}%`;
    el.style.top = `${next.y * 100}%`;
    callbacks.onMove(draggingId, next);
  }

  function onPointerUp(e: PointerEvent) {
    if (!draggingId) return;
    const el = cardEls.get(draggingId);
    el?.classList.remove("venn-held");
    el?.removeEventListener("pointermove", onPointerMove);
    el?.removeEventListener("pointerup", onPointerUp);
    draggingId = null;
  }

  function setRoom(room: SharedRoom) {
    const seen = new Set<Id>();
    for (const card of Object.values(room.cards)) {
      seen.add(card.id);
      // Don't fight a drag I'm in the middle of — the authoritative
      // patch for my own move will match what I already show.
      if (draggingId === card.id) continue;
      let el = cardEls.get(card.id);
      if (!el) {
        el = buildCardEl(card);
        cardEls.set(card.id, el);
        stage.appendChild(el);
      }
      layoutCard(card, el);
    }
    for (const [id, el] of cardEls) {
      if (!seen.has(id)) {
        el.remove();
        cardEls.delete(id);
      }
    }
    setPresent(room.present);
  }

  function applyPatch(changed: SharedCard[], removed: Id[]) {
    for (const card of changed) {
      if (draggingId === card.id) continue; // see setRoom's comment
      let el = cardEls.get(card.id);
      if (!el) {
        el = buildCardEl(card);
        cardEls.set(card.id, el);
        stage.appendChild(el);
      }
      layoutCard(card, el);
    }
    for (const id of removed) {
      const el = cardEls.get(id);
      if (el) {
        el.remove();
        cardEls.delete(id);
      }
    }
  }

  function setPresent(presentList: SharedRoom["present"]) {
    presenceEl.innerHTML = "";
    for (const p of presentList) {
      const chip = document.createElement("span");
      chip.className = "venn-presence-chip";
      chip.textContent = p.name;
      presenceEl.appendChild(chip);
    }
  }

  return {
    setOpen: (open) => panel.classList.toggle("venn-open", open),
    setRoom,
    applyPatch,
    setPresent,
    setMyName: (name) => {
      myName = name;
    },
    destroy: () => {
      rootEl.remove();
      style.remove();
      cardEls = new Map();
    },
  };
}
