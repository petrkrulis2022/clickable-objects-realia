// Visual constants from docs/PRD.md, section "Visual design".
// Keep every magic number here so later steps (drag, zones, cards,
// teacher panel) read from one place instead of re-guessing values.

export const Z_INDEX_MAX = 2147483647;

export const STAGE_ASPECT = 16 / 9;
export const STAGE_BAND_FRACTION = 0.55; // lower 55% of the viewport
export const STAGE_MARGIN_PX = 24;

export const SCRIM_COLOR = "rgba(0,0,0,0.35)";
export const SCRIM_FEATHER_PX = 16;

export const BACKDROP_CROSSFADE_MS = 200;

export const OBJECT_MIN_SIZE_PX = 88;
export const OBJECT_RADIUS_PX = 12;
export const OBJECT_BORDER = "2px solid #1a1a1a";
export const OBJECT_SHADOW = "0 4px 12px rgba(0,0,0,0.45)";
export const OBJECT_LABEL_FONT_SIZE_PX = 18;
export const OBJECT_LABEL_WEIGHT = 600;
export const OBJECT_LABEL_COLOR = "#111";
export const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const EMOJI_FONT_SIZE_PX = 40;

export const DROP_ZONE_BORDER = "2px dashed rgba(255,255,255,0.75)";
export const DROP_THRESHOLD_STAGE_WIDTH_FRACTION = 0.06;

export const SNAP_MS = 180;
export const SNAP_EASING = "cubic-bezier(0.2, 0, 0, 1)";
export const RETURN_MS = 280;
export const RETURN_SHAKE_PX = 6;
export const PULSE_MS = 160;
export const HELD_SCALE = 1.05;
export const HELD_SHADOW = "0 10px 24px rgba(0,0,0,0.55)";

export const SENTENCE_FONT_SIZE_PX = 20;
export const SENTENCE_GAP_PX = 8;

export const PEER_CURSOR_DOT_PX = 12;
export const PEER_CURSOR_LABEL_PX = 12;

export const TEACHER_PANEL_WIDTH_PX = 280;
export const TEACHER_PANEL_BG = "rgba(20,20,22,0.92)";
