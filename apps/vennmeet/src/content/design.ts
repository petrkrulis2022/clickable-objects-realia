// Visual constants from docs/SPEC-VENNMEET.md, "Design". Keep every
// magic number here so later prompts (shared layer, onboarding) read
// from one place instead of re-guessing values.

export const Z_INDEX_MAX = 2147483647;
export const SYSTEM_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const PRIVATE_DOCK_TOP_PX = 24;
export const PRIVATE_DOCK_WIDTH_PX = 520;
export const PRIVATE_DOCK_MAX_VH_FRACTION = 0.35;

export const SHARED_DOCK_WIDTH_PX = 680;
export const SHARED_DOCK_MAX_VH_FRACTION = 0.3;

export const PANEL_BG = "rgba(18,18,20,0.94)";
export const PANEL_RADIUS_PX = 14;
export const PANEL_SHADOW = "0 8px 24px rgba(0,0,0,0.5)";

export const SHARED_ACCENT_COLOR = "#7c5cff";
export const SHARED_ACCENT_RULE_PX = 3;

export const SECTION_TAB_FONT_SIZE_PX = 13;
export const SECTION_TAB_WEIGHT = 600;

// Card text size by LayerPrefs.size ('S' | 'M' | 'L')
export const CARD_TEXT_SIZE_PX = { S: 15, M: 17, L: 20 } as const;
export const CARD_TEXT_WEIGHT = 500;
export const CARD_TEXT_LINE_HEIGHT = 1.35;
export const CARD_TEXT_COLOR = "#f2f2f2";

export const CARD_TITLE_FONT_SIZE_PX = 12;
export const CARD_TITLE_COLOR = "#9a9a9a";
export const CARD_TITLE_LETTER_SPACING = "0.06em";

export const NUMBER_FIGURE_FONT_SIZE_PX = 22;
export const NUMBER_SPOKEN_FONT_SIZE_PX = 14;

export const DECISION_META_FONT_SIZE_PX = 11;

export const CHECKLIST_TICKBOX_PX = 20;
export const CHECKLIST_DONE_OPACITY = 0.5;

export const DRAG_LIFT_MS = 150;
export const DRAG_SNAP_MS = 180;
export const DRAG_SNAP_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export const PEER_CURSOR_DOT_PX = 12;

export const COLLAPSE_TAB_PX = 28;

export const MAX_CARDS_PER_SECTION = 6;
export const LONG_LINE_WORD_LIMIT = 8;

export const DEFAULT_LAYER_PREFS = {
  dock: "top" as const,
  size: "M" as const,
  opacity: 1,
  collapsed: { private: false, shared: false },
};
