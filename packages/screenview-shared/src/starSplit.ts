import type { StarPart } from "./index.js";
import { classifyStarPart } from "./starClassifier.js";

export interface StarSplitPart {
  part: StarPart;
  text: string;
  covered: boolean;
  thin: boolean;
  seconds: number;
}

const PART_ORDER: StarPart[] = ["situation", "task", "action", "result"];

// "Thin" means covered but barely — "Forty seconds on Situation and
// eight on Result is a picture that explains itself"
// (docs/SPEC-SCREENVIEW.md, "A practice session"). Eight seconds reads
// as thin; a round number below the next bucket up.
const THIN_SECONDS_THRESHOLD = 10;

/**
 * Splits a stored transcript into its four STAR parts for the feedback
 * screen ("the transcript split into its STAR parts, with what was
 * missing or thin marked, and the time spent on each" — SPEC, "Feedback
 * and the retry"). Walks sentence by sentence, classifying each with
 * the same heuristic the live session uses; an unclassified sentence
 * continues whichever part came before it, since real answers don't
 * re-announce "now I'll tell you the task." The candidate's own words
 * only — nothing here is generated.
 */
export function splitTranscriptByElement(
  transcript: string,
  covered: Record<StarPart, { covered: boolean; seconds: number }>,
): StarSplitPart[] {
  const sentences = transcript
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const buckets: Record<StarPart, string[]> = { situation: [], task: [], action: [], result: [] };
  let current: StarPart = "situation";
  for (const sentence of sentences) {
    const classified = classifyStarPart(sentence);
    if (classified) current = classified;
    buckets[current].push(sentence);
  }

  return PART_ORDER.map((part) => {
    const c = covered[part];
    return {
      part,
      text: buckets[part].join(" "),
      covered: c.covered,
      thin: c.covered && c.seconds > 0 && c.seconds < THIN_SECONDS_THRESHOLD,
      seconds: c.seconds,
    };
  });
}
