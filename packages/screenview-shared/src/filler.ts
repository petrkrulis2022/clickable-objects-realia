// "Two numbers, nothing else... a filler count ticking up: um, like,
// you know, sort of" (docs/SPEC-SCREENVIEW.md, "A practice session").
// Counts literal occurrences of exactly these four markers — no
// attempt to disambiguate "I like it" from a filler "like", since the
// SPEC names this closed, literal set rather than asking for judgment.
const FILLER_PATTERNS = [/\bum\b/gi, /\blike\b/gi, /\byou know\b/gi, /\bsort of\b/gi];

/** Counts filler-word occurrences in one chunk of transcript text. Callers sum across chunks for a running total. */
export function countFillers(text: string): number {
  return FILLER_PATTERNS.reduce((total, re) => total + (text.match(re)?.length ?? 0), 0);
}
