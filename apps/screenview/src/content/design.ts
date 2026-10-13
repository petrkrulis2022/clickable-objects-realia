// Visual constants for ScreenView's in-call layers (practice stage,
// feedback view, interview-mode coverage deck). Kept in one place so
// later prompts don't re-guess values — same convention as
// apps/vennmeet/src/content/design.ts.

export const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const PANEL_BG = "rgba(18,18,20,0.94)";
export const PANEL_RADIUS_PX = 14;
export const PANEL_SHADOW = "0 8px 24px rgba(0,0,0,0.5)";

export const TEXT_COLOR = "#f2f2f2";
export const MUTED_TEXT_COLOR = "#9a9a9a";

export const COVERED_COLOR = "#3fae5c";
export const GAP_COLOR = "#c94545";
export const THIN_COLOR = "#c9a845";

// "Docked under the webcam" (docs/SPEC-SCREENVIEW.md, "6. Interview
// mode and onboarding", referencing the Venn design table). Self-view
// tile position varies by call platform and layout, so this docks to
// a fixed corner rather than detecting the tile — a deliberate,
// disclosed simplification, not a measurement of the real DOM.
export const DOCK_BOTTOM_PX = 24;
export const DOCK_LEFT_PX = 24;
export const DOCK_WIDTH_PX = 280;
