import type { StarPart } from "./index.js";

/**
 * "Ask one follow-up chosen FROM THE QUESTION'S FIXED probes array.
 * The model selects a probe; it never writes one"
 * (docs/SPEC-SCREENVIEW.md, "4. The AI interviewer"). These three are
 * the exact examples given in "A practice session" — nothing here is
 * generated, and `decideProbe` only ever returns an index into this
 * array or null.
 */
export const FIXED_PROBES: readonly string[] = [
  'You leaned on "we" — what did you specifically do?',
  "What would you do differently?",
  "What was the actual outcome?",
];

/**
 * Whether to probe, and which fixed probe to use. Priority: a "we"-
 * heavy answer gets the pronoun probe first (SPEC: "the answer leans
 * on 'we' rather than 'I'"); otherwise a missing Result gets the
 * outcome probe (SPEC's own observation: "almost everyone runs dry
 * before Result"); otherwise any other missing element gets the
 * general probe. A fully covered, "I"-centred answer draws no probe.
 */
export function decideProbe(covered: Record<StarPart, { covered: boolean; seconds: number }>, transcript: string): number | null {
  const weCount = (transcript.match(/\b(we|our|us)\b/gi) ?? []).length;
  const iCount = (transcript.match(/\b(i|my|me)\b/gi) ?? []).length;
  if (weCount > 0 && weCount > iCount) return 0;
  if (!covered.result.covered) return 2;
  if (!covered.situation.covered || !covered.task.covered || !covered.action.covered) return 1;
  return null;
}
