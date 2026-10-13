import type { FadeLevel, StarPart, Story } from "@screenview/shared";

const PART_ORDER: StarPart[] = ["situation", "task", "action", "result"];

/** docs/SPEC-SCREENVIEW.md, "The fade" table — the schedule is fixed, by session number, never a setting. */
export function fadeLevelForSession(sessionNumber: number): FadeLevel {
  if (sessionNumber <= 1) return "notes";
  if (sessionNumber === 2) return "short-notes";
  if (sessionNumber === 3) return "outlines";
  if (sessionNumber === 4) return "after-only";
  return "none";
}

const SHORT_NOTE_WORD_COUNT = 4;

function shorten(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= SHORT_NOTE_WORD_COUNT) return words.join(" ");
  return words.slice(0, SHORT_NOTE_WORD_COUNT).join(" ") + "…";
}

/**
 * What one STAR block shows on the stage before/during the answer, for
 * a given fade level. "outlines" shows the part's name only (the
 * shape, not the content); "after-only" and "none" show nothing until
 * feedback, so this returns "" — the caller renders the empty block
 * outline itself rather than this producing filler text for it.
 */
export function notesForStarPart(fadeLevel: FadeLevel, story: Pick<Story, StarPart> | null, part: StarPart): string {
  if (!story) return "";
  switch (fadeLevel) {
    case "notes":
      return story[part];
    case "short-notes":
      return shorten(story[part]);
    case "outlines":
    case "after-only":
    case "none":
      return "";
  }
}

export { PART_ORDER };
