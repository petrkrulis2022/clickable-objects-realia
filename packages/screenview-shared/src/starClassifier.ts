import type { StarPart } from "./index.js";

// A heuristic keyword classifier — a documented stand-in for "the
// model classifies which STAR element a passage covers"
// (docs/SPEC-SCREENVIEW.md, "Architecture"). It has no network, no API
// key and nothing to verify live in this environment, so it runs
// locally and deterministically instead. Swapping in a real model
// classifier later only requires satisfying this same signature.
const SIGNALS: Record<StarPart, RegExp[]> = {
  situation: [
    /\b(at my (last|previous|old) (job|role|company))\b/i,
    /\b(when i was (working|a|an))\b/i,
    /\b(there was a (time|situation|moment))\b/i,
    /\b(the (context|situation|background) was)\b/i,
    /\b(we had a (situation|problem|issue) where)\b/i,
  ],
  task: [
    /\b(my (task|job|responsibility) was)\b/i,
    /\b(i (was|got) (asked|tasked|responsible) (to|for))\b/i,
    /\b(i needed to)\b/i,
    /\b(the goal was)\b/i,
    /\b(i had to)\b/i,
  ],
  action: [
    // "so " is optional and non-capturing here specifically so this
    // doesn't also fire the plain "i decided" case below it twice for
    // the same sentence — distinct patterns, not overlapping ones, is
    // what keeps same-category scores meaningful.
    /\b(?:so )?i (decided|started|began|built|led|organi[sz]ed|implemented|created|wrote|designed)\b/i,
    /\b(the first thing i did)\b/i,
    /\b(i (set up|reached out|proposed|coordinated))\b/i,
  ],
  result: [
    /\b(as a result)\b/i,
    /\b(in the end)\b/i,
    /\b(ultimately)\b/i,
    /\b(we (achieved|increased|reduced|improved|cut|grew|saved))\b/i,
    /\b(the outcome was)\b/i,
    /\b(this led to)\b/i,
  ],
};

const PARTS: StarPart[] = ["situation", "task", "action", "result"];

/** Returns the STAR part this passage most likely covers, or null if no signal fired. Ties resolve to null — an unclear passage should not light a block. */
export function classifyStarPart(text: string): StarPart | null {
  let best: StarPart | null = null;
  let bestScore = 0;
  for (const part of PARTS) {
    const score = SIGNALS[part].reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
    if (score > bestScore) {
      best = part;
      bestScore = score;
    } else if (score > 0 && score === bestScore) {
      best = null; // a genuine tie is not a confident classification
    }
  }
  return best;
}
