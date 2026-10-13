import type { Competency } from "@screenview/shared";

// "Competency extraction is a parse, not an invention. Every
// competency card must trace to a phrase in the pasted job
// description" (docs/SPEC-SCREENVIEW.md, "The coverage map"). No AI,
// no network — a fixed list of known competency-indicating phrases,
// matched against the pasted text. A phrase the model "knows" a role
// usually needs but that doesn't literally appear in the JD is
// exactly what this must never produce.
const KNOWN_PHRASES: string[] = [
  "stakeholder management",
  "shipping under deadline",
  "tight deadlines",
  "conflict resolution",
  "working with ambiguity",
  "cross-functional",
  "cross functional",
  "project management",
  "team leadership",
  "people management",
  "mentoring",
  "coaching",
  "communication skills",
  "problem solving",
  "problem-solving",
  "decision making",
  "decision-making",
  "data-driven",
  "data driven",
  "strategic planning",
  "budget management",
  "process improvement",
  "change management",
  "customer focus",
  "customer-centric",
  "attention to detail",
  "time management",
  "prioritization",
  "collaboration",
  "negotiation",
  "presentation skills",
  "analytical skills",
  "technical leadership",
  "risk management",
  "quality assurance",
  "continuous improvement",
  "cross-team collaboration",
  "agile",
  "scrum",
  "ownership",
  "accountability",
  "adaptability",
  "innovation",
  "scalability",
  "performance optimization",
  "incident response",
  "on-call",
  "code review",
  "mentorship",
  "hiring",
  "roadmap planning",
];

function genId(): string {
  return crypto.randomUUID();
}

/**
 * Finds every known phrase that literally appears in `text` (case-
 * insensitive, word-boundary matched), and returns one Competency per
 * unique phrase found — never one the model merely thinks the role
 * "usually" needs. `sourcePhrase` is the exact text as it appears in
 * the pasted JD (original casing preserved), shown when the card is
 * tapped so the claim is always checkable.
 */
export function parseCompetencies(jobDescription: string): Competency[] {
  const found = new Map<string, string>(); // lowercase phrase -> exact matched text

  for (const phrase of KNOWN_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i");
    const match = jobDescription.match(re);
    if (match && !found.has(phrase.toLowerCase())) {
      found.set(phrase.toLowerCase(), match[0]);
    }
  }

  return [...found.entries()].map(([, sourcePhrase]) => ({
    id: genId(),
    name: sourcePhrase,
    sourcePhrase,
    storyIds: [],
  }));
}
