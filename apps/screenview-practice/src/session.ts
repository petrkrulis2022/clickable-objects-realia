import type { Covered, Question, Role, StarPart } from "@screenview/shared";
import { classifyStarPart, countFillers, decideProbe } from "@screenview/shared";

export type { Covered };

function emptyCovered(): Covered {
  return {
    situation: { covered: false, seconds: 0 },
    task: { covered: false, seconds: 0 },
    action: { covered: false, seconds: 0 },
    result: { covered: false, seconds: 0 },
  };
}

export interface DeltaResult {
  /** The part this delta was classified into, if any (for the server to send `star-covered`). */
  part: StarPart | null;
  /** The running total for `part`, so the caller doesn't need to re-read state. */
  seconds: number;
  fillerDelta: number;
}

export interface SessionConfig {
  role: Pick<Role, "id" | "title" | "competencies">;
  question: Question;
  now?: () => number;
}

/**
 * One question-answering session (docs/SPEC-SCREENVIEW.md: a
 * `PracticeSessionStartRequest` carries one role + one question — a
 * retry is a second session for the same question, not a mutation of
 * this one). Tracks STAR coverage, filler count and elapsed time from
 * the candidate's own transcript, and decides at most one probe per
 * answer. No candidate-facing prose is ever produced here — only
 * enum/boolean/number state and an index into the question's own
 * fixed `probes` array.
 */
export class AnswerSession {
  readonly role: SessionConfig["role"];
  readonly question: Question;
  private readonly now: () => number;
  private covered: Covered = emptyCovered();
  private fillerCount = 0;
  private transcript = "";
  private readonly startedAtMs: number;
  private lastDeltaAtMs: number;
  private probed = false;

  constructor(config: SessionConfig) {
    this.role = config.role;
    this.question = config.question;
    this.now = config.now ?? Date.now;
    this.startedAtMs = this.now();
    this.lastDeltaAtMs = this.startedAtMs;
  }

  /** The candidate's own words, streamed from Scribe — never generated. */
  handleTranscriptDelta(text: string): DeltaResult {
    const nowMs = this.now();
    const elapsedSeconds = Math.max(0, (nowMs - this.lastDeltaAtMs) / 1000);
    this.lastDeltaAtMs = nowMs;

    this.transcript += (this.transcript ? " " : "") + text;
    const fillerDelta = countFillers(text);
    this.fillerCount += fillerDelta;

    const part = classifyStarPart(text);
    if (!part) return { part: null, seconds: 0, fillerDelta };

    const prior = this.covered[part];
    this.covered[part] = { covered: true, seconds: prior.seconds + elapsedSeconds };
    return { part, seconds: this.covered[part].seconds, fillerDelta };
  }

  /** Exactly one probe per answer — a second call returns null even if the first answer was thin. */
  decideProbeIndex(): number | null {
    if (this.probed) return null;
    const index = decideProbe(this.covered, this.transcript);
    if (index !== null) this.probed = true;
    return index;
  }

  feedback(): { covered: Covered; fillerCount: number; totalSeconds: number } {
    return {
      covered: structuredClone(this.covered),
      fillerCount: this.fillerCount,
      totalSeconds: Math.max(0, (this.now() - this.startedAtMs) / 1000),
    };
  }

  /** The candidate's own transcript so far — stored locally with the session, never sent back as a response field. */
  getTranscript(): string {
    return this.transcript;
  }
}
