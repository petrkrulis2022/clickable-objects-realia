import { STAGE_ASPECT, STAGE_BAND_FRACTION, STAGE_MARGIN_PX } from "./design";
import type { Vec } from "@co/shared";

export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The stage is defined against a fixed 16:9 aspect, letterboxed and
 * centred inside the lower band of the viewport — never against the
 * raw viewport — so two people with different window shapes still
 * see the same relative arrangement. See docs/PRD.md, "The stage,
 * not the viewport."
 *
 * `leftInsetPx` reserves space on the left for the teacher panel
 * (docs/PRD.md, "7. Teacher panel and activity runner": "never
 * overlapping the stage"). On a very wide window the stage can
 * otherwise reach the viewport's left edge, so this is computed into
 * the geometry itself rather than hoping typical window shapes avoid
 * the overlap.
 */
export function computeStage(viewportW: number, viewportH: number, leftInsetPx = 0): StageRect {
  const bandTop = viewportH * (1 - STAGE_BAND_FRACTION);
  const bandHeight = viewportH * STAGE_BAND_FRACTION;

  const regionW = Math.max(0, viewportW - leftInsetPx);
  const availableW = Math.max(0, regionW - 2 * STAGE_MARGIN_PX);
  const availableH = Math.max(0, bandHeight - 2 * STAGE_MARGIN_PX);

  let w: number;
  let h: number;
  if (availableW / availableH > STAGE_ASPECT) {
    h = availableH;
    w = h * STAGE_ASPECT;
  } else {
    w = availableW;
    h = w / STAGE_ASPECT;
  }

  const x = leftInsetPx + (regionW - w) / 2;
  const y = bandTop + (bandHeight - h) / 2;

  return { x, y, w, h };
}

/** Normalised 0..1 stage coordinate -> absolute page pixels. */
export function stageToPagePx(stage: StageRect, pos: Vec): { x: number; y: number } {
  return { x: stage.x + pos.x * stage.w, y: stage.y + pos.y * stage.h };
}

/** Normalised 0..1 stage-relative size -> pixel size, floored to a minimum. */
export function sizeToPagePx(
  stage: StageRect,
  size: { w: number; h: number },
  minPx: number,
): { w: number; h: number } {
  return {
    w: Math.max(minPx, size.w * stage.w),
    h: Math.max(minPx, size.h * stage.h),
  };
}

/** Clamp a normalised position so the object (by its normalised size) never leaves the stage. */
export function clampPos(pos: Vec, size: { w: number; h: number }): Vec {
  return {
    x: Math.min(Math.max(pos.x, 0), Math.max(0, 1 - size.w)),
    y: Math.min(Math.max(pos.y, 0), Math.max(0, 1 - size.h)),
  };
}
