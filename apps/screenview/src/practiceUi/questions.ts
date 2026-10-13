import type { Competency, Question, Role } from "@screenview/shared";
import { FIXED_PROBES } from "@screenview/shared";

/**
 * One fixed-template question per competency — not an invention, a
 * deterministic restatement of the competency name the parser already
 * traced to the JD. The probes are the same FIXED array for every
 * question; nothing here is written by a model
 * (docs/SPEC-SCREENVIEW.md: "the model selects a probe; it never
 * writes one").
 */
export function generateQuestionBank(role: Pick<Role, "competencies">): Question[] {
  return role.competencies.map((c) => ({
    id: `q-${c.id}`,
    text: `Tell me about a time you demonstrated ${c.name}.`,
    competencyId: c.id,
    probes: [...FIXED_PROBES],
  }));
}

/**
 * "Deal a question from the role's bank, weighted toward uncovered
 * competencies... Never let the candidate choose the question"
 * (docs/SPEC-SCREENVIEW.md, "3. The practice session loop"). A gap
 * competency is three times as likely to come up as a covered one —
 * practising the thing you don't have a story for yet is the whole
 * point. Excludes questions already asked this session until every
 * question has had a turn, then opens back up.
 */
export function dealQuestion(
  bank: Question[],
  competencies: Competency[],
  askedQuestionIds: string[],
  random: () => number = Math.random,
): Question | null {
  if (bank.length === 0) return null;

  const notYetAsked = bank.filter((q) => !askedQuestionIds.includes(q.id));
  const pool = notYetAsked.length > 0 ? notYetAsked : bank;

  const weights = pool.map((q) => {
    const competency = competencies.find((c) => c.id === q.competencyId);
    return competency && competency.storyIds.length === 0 ? 3 : 1;
  });
  const total = weights.reduce((a, b) => a + b, 0);

  let r = random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
