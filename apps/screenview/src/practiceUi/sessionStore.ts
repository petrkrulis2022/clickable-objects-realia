import type { Answer, Role, Session } from "@screenview/shared";
import { generateQuestionBank } from "./questions";

const SESSIONS_KEY = "screenview.sessions"; // Record<roleId, Session[]>

function genId(): string {
  return crypto.randomUUID();
}

async function readAll(): Promise<Record<string, Session[]>> {
  const result = await chrome.storage.local.get(SESSIONS_KEY);
  return (result[SESSIONS_KEY] as Record<string, Session[]> | undefined) ?? {};
}

async function writeAll(all: Record<string, Session[]>): Promise<void> {
  await chrome.storage.local.set({ [SESSIONS_KEY]: all });
}

export async function listSessions(roleId: string): Promise<Session[]> {
  const all = await readAll();
  return all[roleId] ?? [];
}

export async function saveSession(roleId: string, session: Session): Promise<void> {
  const all = await readAll();
  const existing = all[roleId] ?? [];
  all[roleId] = [...existing.filter((s) => s.id !== session.id), session];
  await writeAll(all);
}

/** Session numbers drive the fade schedule, so they must be 1, 2, 3... per role, not reused. */
export function nextSessionNumber(sessions: Session[]): number {
  return sessions.length === 0 ? 1 : Math.max(...sessions.map((s) => s.number)) + 1;
}

export function newSession(roleId: string, number: number): Session {
  return { id: genId(), roleId, number, startedAt: new Date().toISOString(), answers: [] };
}

export interface SessionSummary {
  competenciesPracticed: string[];
  ranLong: string[];
  fillerTrend: "improving" | "worsening" | "flat" | "not-enough-data";
  stillUncovered: string[];
}

function competencyNameForAnswer(answer: Answer, role: Pick<Role, "competencies">): string | null {
  const bank = generateQuestionBank(role);
  const question = bank.find((q) => q.id === answer.questionId);
  const competency = question && role.competencies.find((c) => c.id === question.competencyId);
  return competency?.name ?? null;
}

/**
 * "A short summary: competencies practised, which ran long, filler
 * trend across attempts, and which competencies are still uncovered
 * on the map" (docs/SPEC-SCREENVIEW.md, "5. Feedback and the retry").
 * Every name here comes from `role.competencies` — nothing invented,
 * satisfying "the session summary names only competencies that exist
 * on the map".
 */
export function computeSessionSummary(session: Session, role: Pick<Role, "competencies">): SessionSummary {
  const names = session.answers
    .map((a) => competencyNameForAnswer(a, role))
    .filter((n): n is string => n !== null);
  const competenciesPracticed = [...new Set(names)];

  const avgSeconds =
    session.answers.length > 0
      ? session.answers.reduce((sum, a) => sum + a.totalSeconds, 0) / session.answers.length
      : 0;
  const ranLong = [...new Set(
    session.answers
      .filter((a) => avgSeconds > 0 && a.totalSeconds > avgSeconds * 1.5)
      .map((a) => competencyNameForAnswer(a, role))
      .filter((n): n is string => n !== null),
  )];

  let fillerTrend: SessionSummary["fillerTrend"] = "not-enough-data";
  if (session.answers.length >= 2) {
    const mid = Math.floor(session.answers.length / 2);
    const firstHalf = session.answers.slice(0, mid);
    const secondHalf = session.answers.slice(mid);
    const avg = (xs: Answer[]) => xs.reduce((s, a) => s + a.fillerCount, 0) / xs.length;
    const firstAvg = avg(firstHalf);
    const secondAvg = avg(secondHalf);
    if (secondAvg < firstAvg - 0.5) fillerTrend = "improving";
    else if (secondAvg > firstAvg + 0.5) fillerTrend = "worsening";
    else fillerTrend = "flat";
  }

  const stillUncovered = role.competencies.filter((c) => c.storyIds.length === 0).map((c) => c.name);

  return { competenciesPracticed, ranLong, fillerTrend, stillUncovered };
}
