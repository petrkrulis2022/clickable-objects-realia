import { LONG_LINE_WORD_LIMIT } from "../content/design";

export const LONG_LINE_MESSAGE = "Long lines get read, not glanced at.";

/** Pure check — warn, never block (docs/SPEC-VENNMEET.md, "Glanceable, not readable"). */
export function isLongLine(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > LONG_LINE_WORD_LIMIT;
}
