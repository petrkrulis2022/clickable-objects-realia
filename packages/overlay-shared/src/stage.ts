// Extracted from apps/realia/src/content/stage.ts during ScreenView's
// prompt 1 (docs/SPEC-SCREENVIEW.md: "reusing the overlay code from
// apps/realia by extraction at that point, not before") — Realia
// remains on its own copy; retrofitting it to import from here is
// optional cleanup, not required by anything that asked for this
// extraction. VennMeet's private layer doesn't use this at all: its
// UI is fixed-position card lists in a docked panel, not freely
// draggable objects on an open stage, so there was nothing in common
// to extract when it was built.

export type Vec = { x: number; y: number };

export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StageConfig {
  aspect: number;
  bandFraction: number; // what fraction of the viewport height the stage's band occupies
  marginPx: number;
}

export const DEFAULT_STAGE_CONFIG: StageConfig = {
  aspect: 16 / 9,
  bandFraction: 0.55,
  marginPx: 24,
};

/**
 * The stage is defined against a fixed aspect ratio, letterboxed and
 * centred inside a band of the viewport — never against the raw
 * viewport — so two people (or the same person at a different window
 * size) still see the same relative arrangement.
 *
 * `leftInsetPx` reserves space on the left for a docked panel. On a
 * very wide window the stage can otherwise reach the viewport's left
 * edge, so this is computed into the geometry itself rather than
 * hoping typical window shapes avoid the overlap.
 */
export function computeStage(
  viewportW: number,
  viewportH: number,
  leftInsetPx = 0,
  config: StageConfig = DEFAULT_STAGE_CONFIG,
): StageRect {
  const bandTop = viewportH * (1 - config.bandFraction);
  const bandHeight = viewportH * config.bandFraction;

  const regionW = Math.max(0, viewportW - leftInsetPx);
  const availableW = Math.max(0, regionW - 2 * config.marginPx);
  const availableH = Math.max(0, bandHeight - 2 * config.marginPx);

  let w: number;
  let h: number;
  if (availableW / availableH > config.aspect) {
    h = availableH;
    w = h * config.aspect;
  } else {
    w = availableW;
    h = w / config.aspect;
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
