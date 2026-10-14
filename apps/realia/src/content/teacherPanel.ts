import type { LessonPack } from "@realia/shared";
import { attachDragHandle, type Pos } from "@overlay/shared";
import { SYSTEM_FONT_STACK, TEACHER_PANEL_BG, TEACHER_PANEL_WIDTH_PX, Z_INDEX_MAX } from "./design";
import type { OverlayHandle } from "./overlay";

const PANEL_POS_KEY = "realia.teacherPanelPos";

const CSS = `
  .co-panel {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: ${TEACHER_PANEL_WIDTH_PX}px;
    background: ${TEACHER_PANEL_BG};
    color: #f2f2f2;
    font-family: ${SYSTEM_FONT_STACK};
    z-index: ${Z_INDEX_MAX};
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 16px;
    gap: 12px;
    overflow: hidden;
    transition: transform 160ms ease-out;
  }
  .co-panel.co-collapsed { transform: translateX(calc(-100% + 14px)); }
  .co-panel.co-floating {
    bottom: auto;
    height: auto;
    max-height: 70vh;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  }
  .co-panel-header { display: flex; align-items: center; gap: 8px; }
  .co-drag-handle {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    border: none;
    background: rgba(255,255,255,0.08);
    color: #ccc;
    font-size: 12px;
    cursor: grab;
    touch-action: none;
  }
  .co-panel h2 { margin: 0; font-size: 13px; font-weight: 600; color: #9a9a9a; text-transform: uppercase; letter-spacing: 0.04em; }
  .co-panel .co-timer { font-size: 13px; color: #9a9a9a; }
  .co-panel .co-prompt { font-size: 18px; font-weight: 600; line-height: 1.3; }
  .co-panel .co-nav { display: flex; gap: 8px; }
  .co-panel button {
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    padding: 10px 14px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background: #3a3a3d;
    color: #fff;
  }
  .co-panel button:disabled { opacity: 0.4; cursor: default; }
  .co-panel .co-nav button { flex: 1; }
  .co-panel .co-mark { display: flex; gap: 8px; }
  .co-panel .co-mark button.co-correct { background: #2f6f4f; }
  .co-panel .co-mark button.co-retry { background: #7a4a2a; }
  .co-panel .co-items { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
  .co-panel .co-items li {
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 13px;
    color: #b8b8b8;
  }
  .co-panel .co-items li.co-current { background: rgba(255,255,255,0.12); color: #fff; font-weight: 600; }
  .co-panel .co-collapse-btn {
    position: absolute;
    right: -14px;
    top: 16px;
    width: 14px;
    height: 40px;
    padding: 0;
    border-radius: 0 6px 6px 0;
    background: #3a3a3d;
    font-size: 11px;
  }
`;

export interface TeacherPanelOptions {
  overlay: OverlayHandle;
  pack: LessonPack;
  initialItemIndex: number;
  onSetActivity: (itemIndex: number) => void;
  onMark: (itemIndex: number, verdict: "correct" | "retry") => void;
}

export interface TeacherPanelController {
  destroy(): void;
}

/**
 * The teacher-only panel and item navigation (docs/PRD.md, "7. Teacher
 * panel and activity runner"). Never rendered for the student — the
 * caller only constructs this for the teacher role. Docked left,
 * collapsible, reserves its own width from the stage via
 * overlay.setLeftInset so it truly never overlaps it.
 */
export function attachTeacherPanel(opts: TeacherPanelOptions): TeacherPanelController {
  const { overlay, pack, onSetActivity, onMark } = opts;
  let currentIndex = opts.initialItemIndex;
  let collapsed = false;
  let floating = false;
  const startedAt = Date.now();

  const style = document.createElement("style");
  style.textContent = CSS;
  overlay.root.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "co-panel";
  overlay.root.appendChild(panel);

  const headerRow = document.createElement("div");
  headerRow.className = "co-panel-header";
  panel.appendChild(headerRow);

  const dragHandle = document.createElement("button");
  dragHandle.className = "co-drag-handle";
  dragHandle.textContent = "⠿";
  dragHandle.title = "Drag to move";
  headerRow.appendChild(dragHandle);

  const header = document.createElement("h2");
  header.textContent = pack.title;
  headerRow.appendChild(header);

  const timerEl = document.createElement("div");
  timerEl.className = "co-timer";
  panel.appendChild(timerEl);

  const promptEl = document.createElement("div");
  promptEl.className = "co-prompt";
  panel.appendChild(promptEl);

  const nav = document.createElement("div");
  nav.className = "co-nav";
  const prevBtn = document.createElement("button");
  prevBtn.textContent = "← Previous";
  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next (n) →";
  nav.append(prevBtn, nextBtn);
  panel.appendChild(nav);

  const mark = document.createElement("div");
  mark.className = "co-mark";
  const correctBtn = document.createElement("button");
  correctBtn.className = "co-correct";
  correctBtn.textContent = "Correct (1)";
  const retryBtn = document.createElement("button");
  retryBtn.className = "co-retry";
  retryBtn.textContent = "Retry (2)";
  mark.append(correctBtn, retryBtn);
  panel.appendChild(mark);

  const list = document.createElement("ol");
  list.className = "co-items";
  const itemEls: HTMLLIElement[] = pack.items.map((item, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}. ${item.prompt}`;
    list.appendChild(li);
    return li;
  });
  panel.appendChild(list);

  const collapseBtn = document.createElement("button");
  collapseBtn.className = "co-collapse-btn";
  collapseBtn.textContent = "‖";
  panel.appendChild(collapseBtn);

  function setCollapsed(next: boolean) {
    collapsed = next;
    panel.classList.toggle("co-collapsed", collapsed);
    overlay.setLeftInset(collapsed || floating ? 0 : TEACHER_PANEL_WIDTH_PX);
  }

  /**
   * "Dragged anywhere on screen" (on request, not in docs/PRD.md) —
   * once the panel leaves its left-edge dock, the stage should
   * reclaim that reserved width rather than leaving a permanent gap
   * nothing occupies. Idempotent: called from the drag-position apply
   * function, which fires on every pointermove, not just once.
   */
  function makeFloating() {
    if (floating) return;
    floating = true;
    panel.classList.add("co-floating");
    overlay.setLeftInset(0);
  }

  function applyFloatingPosition(el: HTMLElement, pos: Pos) {
    makeFloating();
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    // Deliberately not touching transform — co-collapsed's slide
    // animation depends on it, unlike VennMeet/ScreenView's panels.
  }

  const dragCtl = attachDragHandle(
    panel,
    dragHandle,
    (pos) => void chrome.storage.local.set({ [PANEL_POS_KEY]: pos }),
    applyFloatingPosition,
  );
  void chrome.storage.local.get(PANEL_POS_KEY).then((result) => {
    const stored = result[PANEL_POS_KEY] as Pos | undefined;
    if (stored) applyFloatingPosition(panel, stored);
  });

  function render() {
    const item = pack.items[currentIndex];
    promptEl.textContent = item ? `${currentIndex + 1}/${pack.items.length}: ${item.prompt}` : "";
    prevBtn.disabled = currentIndex <= 0;
    nextBtn.disabled = currentIndex >= pack.items.length - 1;
    itemEls.forEach((li, i) => li.classList.toggle("co-current", i === currentIndex));
    const current = itemEls[currentIndex];
    current?.scrollIntoView({ block: "nearest" });
  }

  function goTo(index: number) {
    if (index < 0 || index >= pack.items.length || index === currentIndex) return;
    currentIndex = index;
    onSetActivity(currentIndex);
    render();
  }

  function next() {
    goTo(currentIndex + 1);
  }
  function prev() {
    goTo(currentIndex - 1);
  }
  function markCurrent(verdict: "correct" | "retry") {
    onMark(currentIndex, verdict);
  }

  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);
  correctBtn.addEventListener("click", () => markCurrent("correct"));
  retryBtn.addEventListener("click", () => markCurrent("retry"));
  collapseBtn.addEventListener("click", () => setCollapsed(!collapsed));

  // Global, not focus-scoped ("Keys must work without the panel being
  // focused") — and deliberately never touches space, which Meet uses
  // as push-to-talk while muted, so that keeps working normally no
  // matter where the pointer is.
  function onKeydown(e: KeyboardEvent) {
    if (e.key === " ") return;
    switch (e.key) {
      case "n":
        next();
        break;
      case "1":
        markCurrent("correct");
        break;
      case "2":
        markCurrent("retry");
        break;
      case "\\":
        setCollapsed(!collapsed);
        break;
      default:
        return;
    }
  }
  window.addEventListener("keydown", onKeydown);

  const timerId = window.setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    timerEl.textContent = `${mm}:${ss}`;
  }, 1000);

  setCollapsed(false);
  render();

  return {
    destroy: () => {
      window.removeEventListener("keydown", onKeydown);
      dragCtl.destroy();
      clearInterval(timerId);
      overlay.setLeftInset(0);
      panel.remove();
      style.remove();
    },
  };
}
