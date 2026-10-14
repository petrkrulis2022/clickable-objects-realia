// Free drag-to-reposition for a floating panel, shared by anything in
// ScreenView that renders a small fixed-position card over the call
// (the practice stage, the interview coverage deck). Position-only —
// callers own persistence (chrome.storage.local, etc.) and initial
// placement; this just wires one handle element to move `panel`
// anywhere in the viewport, clamped so it can't be dragged off-screen.

export interface Pos {
  x: number;
  y: number;
}

export interface DragHandleController {
  destroy(): void;
}

function clampToViewport(panel: HTMLElement, x: number, y: number): Pos {
  const rect = panel.getBoundingClientRect();
  const maxX = Math.max(0, window.innerWidth - rect.width);
  const maxY = Math.max(0, window.innerHeight - rect.height);
  return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
}

/** `panel` must be absolutely/fixed positioned with explicit left/top — this overwrites both directly, and clears right/bottom/transform so nothing else fights it. */
export function applyPanelPosition(panel: HTMLElement, pos: Pos): void {
  panel.style.left = `${pos.x}px`;
  panel.style.top = `${pos.y}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  panel.style.transform = "none";
}

/**
 * Wires pointerdown/move/up on `handle` to drag `panel`. Calls
 * `onMoved` once per drag, on release, with the final pixel position
 * — the caller decides how (or whether) to persist it.
 *
 * `apply` defaults to `applyPanelPosition`, which also zeroes
 * `transform` — fine for a panel that only ever used transform to
 * cancel a centering preset, but wrong for one (Realia's teacher
 * panel) that uses transform for its own collapse animation. Pass a
 * custom `apply` that sets left/top only when that's the case.
 */
export function attachDragHandle(
  panel: HTMLElement,
  handle: HTMLElement,
  onMoved: (pos: Pos) => void,
  apply: (panel: HTMLElement, pos: Pos) => void = applyPanelPosition,
): DragHandleController {
  let offset: Pos | null = null;

  function onPointerDown(e: PointerEvent) {
    e.stopPropagation();
    const rect = panel.getBoundingClientRect();
    offset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    handle.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!offset) return;
    apply(panel, clampToViewport(panel, e.clientX - offset.x, e.clientY - offset.y));
  }
  function endDrag(e: PointerEvent) {
    if (!offset) return;
    const pos = clampToViewport(panel, e.clientX - offset.x, e.clientY - offset.y);
    apply(panel, pos);
    offset = null;
    handle.releasePointerCapture(e.pointerId);
    onMoved(pos);
  }

  handle.addEventListener("pointerdown", onPointerDown);
  handle.addEventListener("pointermove", onPointerMove);
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  return {
    destroy() {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", endDrag);
      handle.removeEventListener("pointercancel", endDrag);
    },
  };
}
