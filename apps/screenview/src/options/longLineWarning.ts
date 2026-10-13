const LONG_LINE_WORD_LIMIT = 8;

export const LONG_LINE_MESSAGE = "Long lines get read, not glanced at.";

/** Pure check — warn, never block (docs/SPEC-SCREENVIEW.md, "The coverage map": "Warn on lines over eight words"). */
export function isLongLine(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > LONG_LINE_WORD_LIMIT;
}
