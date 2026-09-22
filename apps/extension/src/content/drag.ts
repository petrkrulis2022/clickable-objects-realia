import type { Role, StageObject, Vec, Zone } from "@co/shared";
import {
  DROP_THRESHOLD_STAGE_WIDTH_FRACTION,
  PULSE_MS,
  RETURN_MS,
  RETURN_SHAKE_PX,
  SNAP_EASING,
  SNAP_MS,
} from "./design";
import { findAcceptingZone } from "./dropLogic";
import type { OverlayHandle } from "./overlay";
import { clampPos, stageToPagePx, type StageRect } from "./stage";

const MOVE_SEND_MIN_INTERVAL_MS = 1000 / 30; // "never more than thirty a second"

export interface DragControllerOptions {
  overlay: OverlayHandle;
  /** Mutable model, shared with whatever applies incoming server patches. */
  objects: StageObject[];
  sentenceTemplate: string;
  /** zone id -> the label of the thing it's anchored to, for sentence building */
  zoneAnchorLabel: Record<string, string>;
  sendMove: (id: string, pos: Vec) => void;
  sendDrop: (id: string, zoneId: string | null) => void;
}

export interface DragController {
  setMyRole(role: Role): void;
  /** Reconciles an incoming patch into the shared model, per the PRD's optimistic-local / reconcile-on-patch rule. */
  applyRemotePatch(changed: StageObject[], removed: string[]): void;
  destroy(): void;
}

function centerNorm(obj: StageObject) {
  return { x: obj.pos.x + obj.size.w / 2, y: obj.pos.y + obj.size.h / 2 };
}

function centerPx(stage: StageRect, obj: StageObject) {
  return stageToPagePx(stage, centerNorm(obj));
}

/**
 * Dragging is local-first (docs/PRD.md, "3. Dragging and drop zones,
 * local only") with networking layered on in "4. Relay and live
 * sync": every local move is sent to the relay (throttled to 30/s),
 * and incoming patches update objects the local pointer isn't
 * currently holding. The relay owns the soft lock; this controller
 * only avoids grabbing something the last-known state says the other
 * role already holds, and backs off gracefully if it loses a race.
 */
export function attachDragController(opts: DragControllerOptions): DragController {
  const { overlay, objects, sentenceTemplate, zoneAnchorLabel, sendMove, sendDrop } = opts;

  let myRole: Role | null = null;

  function findObject(id: string): StageObject | undefined {
    return objects.find((o) => o.id === id);
  }

  function getZones(): Zone[] {
    return objects.filter((o): o is Zone => o.kind === "zone");
  }

  let draggingId: string | null = null;
  let draggingEl: HTMLElement | null = null;
  let draggingPointerId: number | null = null;
  let dragStartPos: { x: number; y: number } | null = null;
  let lastClientX = 0;
  let lastClientY = 0;
  let lastMoveSentAt = 0;
  let rafHandle = 0;
  let pendingRender = false;

  function scheduleRender() {
    if (pendingRender) return;
    pendingRender = true;
    rafHandle = requestAnimationFrame(() => {
      pendingRender = false;
      overlay.setObjects(objects);
    });
  }

  function onPointerDown(e: PointerEvent) {
    if (!myRole) return; // not connected/joined yet
    const target = e.target as HTMLElement;
    const el = target.closest('.co-object[data-kind="draggable"]') as HTMLElement | null;
    if (!el) return;
    const id = el.dataset.id;
    if (!id) return;
    const obj = findObject(id);
    if (!obj) return;
    if (obj.heldBy && obj.heldBy !== myRole) return; // the other role already has it

    e.preventDefault();
    el.setPointerCapture(e.pointerId);

    draggingId = id;
    draggingEl = el;
    draggingPointerId = e.pointerId;
    dragStartPos = { ...obj.pos };
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    lastMoveSentAt = 0;
    el.classList.add("co-held");

    const acceptingZoneIds = new Set(
      getZones().filter((z) => z.accepts.includes(id)).map((z) => z.id),
    );
    overlay.setZoneHighlight(acceptingZoneIds);
    overlay.setSentence(null);

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (!draggingId) return;
    const obj = findObject(draggingId);
    if (!obj) return;

    const stage = overlay.getStage();
    const dxPx = e.clientX - lastClientX;
    const dyPx = e.clientY - lastClientY;
    lastClientX = e.clientX;
    lastClientY = e.clientY;

    obj.pos = clampPos(
      { x: obj.pos.x + dxPx / stage.w, y: obj.pos.y + dyPx / stage.h },
      obj.size,
    );
    obj.heldBy = myRole;
    scheduleRender();

    const now = performance.now();
    if (now - lastMoveSentAt >= MOVE_SEND_MIN_INTERVAL_MS) {
      lastMoveSentAt = now;
      sendMove(obj.id, obj.pos);
    }
  }

  function releaseDragHandlers(el: HTMLElement) {
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerUp);
    el.classList.remove("co-held");
    overlay.setZoneHighlight(new Set());
  }

  function onPointerUp(e: PointerEvent) {
    if (!draggingId || !dragStartPos) return;
    const id = draggingId;
    const obj = findObject(id);
    const el = overlay.getObjectEl(id);
    const startPos = dragStartPos;
    draggingId = null;
    draggingEl = null;
    draggingPointerId = null;
    dragStartPos = null;
    if (!obj || !el) return;

    releaseDragHandlers(el);
    if (pendingRender) {
      cancelAnimationFrame(rafHandle);
      pendingRender = false;
    }

    const stage = overlay.getStage();
    const thresholdPx = DROP_THRESHOLD_STAGE_WIDTH_FRACTION * stage.w;
    const zones = getZones();
    const zoneCandidates = zones.map((z) => ({
      id: z.id,
      accepts: z.accepts,
      centerPx: centerPx(stage, z),
    }));
    const targetZoneId = findAcceptingZone(id, centerPx(stage, obj), zoneCandidates, thresholdPx);

    if (targetZoneId) {
      const zone = zones.find((z) => z.id === targetZoneId)!;
      const targetPos = clampPos(
        { x: centerNorm(zone).x - obj.size.w / 2, y: centerNorm(zone).y - obj.size.h / 2 },
        obj.size,
      );
      sendMove(id, targetPos);
      sendDrop(id, targetZoneId);
      animateMove(el, stage, obj.pos, targetPos, SNAP_MS, SNAP_EASING, () => {
        obj.pos = targetPos;
        obj.heldBy = null;
        overlay.setObjects(objects);
        pulse(el);
        const sentence = sentenceTemplate
          .replace("{object}", obj.label)
          .replace("{relation}", zone.relation)
          .replace("{anchor}", zoneAnchorLabel[zone.id] ?? zone.relation);
        overlay.setSentence(sentence);
      });
    } else {
      sendMove(id, startPos);
      sendDrop(id, null);
      animateMove(
        el,
        stage,
        obj.pos,
        startPos,
        RETURN_MS,
        "ease-out",
        () => {
          obj.pos = startPos;
          obj.heldBy = null;
          overlay.setObjects(objects);
        },
        true,
      );
    }
  }

  /** Called when a patch reveals the other role won a simultaneous grab. */
  function abortLocalDrag() {
    if (!draggingId || !draggingEl) return;
    const el = draggingEl;
    if (draggingPointerId !== null) {
      try {
        el.releasePointerCapture(draggingPointerId);
      } catch {
        /* already released */
      }
    }
    releaseDragHandlers(el);
    if (pendingRender) {
      cancelAnimationFrame(rafHandle);
      pendingRender = false;
    }
    draggingId = null;
    draggingEl = null;
    draggingPointerId = null;
    dragStartPos = null;
  }

  function applyRemotePatch(changed: StageObject[], removed: string[]) {
    for (const incoming of changed) {
      if (draggingId === incoming.id) {
        // I'm actively dragging this — my optimistic local state wins,
        // UNLESS the relay says someone else now holds it (I lost a
        // race), in which case back off immediately rather than fight.
        if (incoming.heldBy && incoming.heldBy !== myRole) {
          abortLocalDrag();
          replaceObject(incoming);
        }
        continue;
      }
      replaceObject(incoming);
    }
    for (const id of removed) {
      const idx = objects.findIndex((o) => o.id === id);
      if (idx >= 0) objects.splice(idx, 1);
    }
    overlay.setObjects(objects);
  }

  function replaceObject(incoming: StageObject) {
    const idx = objects.findIndex((o) => o.id === incoming.id);
    if (idx >= 0) objects[idx] = incoming;
    else objects.push(incoming);
  }

  overlay.objectsEl.addEventListener("pointerdown", onPointerDown);

  return {
    setMyRole: (role) => {
      myRole = role;
    },
    applyRemotePatch,
    destroy: () => {
      overlay.objectsEl.removeEventListener("pointerdown", onPointerDown);
    },
  };
}

/**
 * Animates an object's visual position from its current model position
 * to `to` (normalised stage coordinates) using a transform, independent
 * of the left/top layout, then commits the model position via
 * `onDone`. Set `shake` for the wrong-drop return, per the PRD's "6px
 * horizontal shake."
 */
function animateMove(
  el: HTMLElement,
  stage: StageRect,
  from: { x: number; y: number },
  to: { x: number; y: number },
  durationMs: number,
  easing: string,
  onDone: () => void,
  shake = false,
) {
  const fromPx = stageToPagePx(stage, from);
  const toPx = stageToPagePx(stage, to);
  const dx = toPx.x - fromPx.x;
  const dy = toPx.y - fromPx.y;

  const frames: Keyframe[] = shake
    ? [
        { transform: "translate(0px, 0px)", offset: 0 },
        { transform: `translate(${dx * 0.6 + RETURN_SHAKE_PX}px, ${dy * 0.6}px)`, offset: 0.25 },
        { transform: `translate(${dx * 0.3 - RETURN_SHAKE_PX}px, ${dy * 0.3}px)`, offset: 0.5 },
        { transform: `translate(${dx * 0.1 + RETURN_SHAKE_PX * 0.5}px, ${dy * 0.1}px)`, offset: 0.75 },
        { transform: "translate(0px, 0px)", offset: 1 },
      ]
    : [{ transform: "translate(0px, 0px)" }, { transform: `translate(${dx}px, ${dy}px)` }];

  const animation = el.animate(frames, { duration: durationMs, easing, fill: "forwards" });
  animation.finished
    .catch(() => {
      /* animation was cancelled, e.g. a new drag started mid-return */
    })
    .finally(() => {
      el.getAnimations().forEach((a) => a.cancel());
      onDone();
    });
}

function pulse(el: HTMLElement) {
  el.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
    { duration: PULSE_MS, easing: "ease-out" },
  );
}
