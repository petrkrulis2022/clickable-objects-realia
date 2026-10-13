// Shared types for ScreenView. TypeScript types only — no runtime
// code. Both apps/screenview and apps/screenview-practice import from
// here. Data model copied verbatim from docs/SPEC-SCREENVIEW.md,
// "Data model".

export type Id = string;
export type StarPart = "situation" | "task" | "action" | "result";

export interface Competency {
  id: Id;
  name: string;
  sourcePhrase: string; // the exact JD text this came from, always shown
  storyIds: Id[]; // empty = a gap
}

export interface Story {
  id: Id;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  draftedByModel: boolean; // true blocks use until the candidate edits it
}

export interface Role {
  id: Id;
  title: string;
  company: string;
  jobDescription: string; // pasted verbatim, kept for provenance
  competencies: Competency[];
  stories: Story[];
  interviewAt?: string;
}

export interface Question {
  id: Id;
  text: string;
  competencyId: Id;
  probes: string[]; // fixed set; the model picks, never writes
}

export interface Answer {
  questionId: Id;
  attempt: 1 | 2;
  transcript: string; // the candidate's own words, stored locally
  covered: Record<StarPart, { covered: boolean; seconds: number }>;
  fillerCount: number;
  totalSeconds: number;
  probeAsked?: string;
}

export interface Session {
  id: Id;
  roleId: Id;
  number: number; // drives the fade schedule
  startedAt: string;
  endedAt?: string;
  answers: Answer[];
}

// What gets carried into the real interview. No AI, no network, no microphone.
export interface InterviewDeck {
  roleId: Id;
  cards: { competency: string; storyTitle: string }[]; // the coverage map
}

export type FadeLevel = "notes" | "short-notes" | "outlines" | "after-only" | "none";

// --- Practice-service protocol ---
// Not given verbatim by the SPEC (only the architecture diagram and
// the constraint that no endpoint returns candidate-facing prose) —
// designed to satisfy that constraint structurally: every response
// type here is enums, numbers, booleans, or an index into the
// question's own FIXED probes array. None has a free-text field that
// could hold model-generated prose; `transcript` fields anywhere in
// this file are always the CANDIDATE's own words, captured via Scribe,
// never written by the model.

export interface PracticeSessionStartRequest {
  role: Pick<Role, "id" | "title" | "competencies">;
  question: Question;
}

export interface PracticeSessionStartResponse {
  sessionToken: string; // opaque; scopes the WS below to this session
}

/** Streamed from the extension to the practice service over the practice-session WebSocket. */
export type PracticeClientMessage =
  | { type: "audio-chunk"; base64: string } // candidate's mic audio, ~1s chunks
  | { type: "answer-ended" };

/** Streamed back. Every variant's payload is structured data, never free text the model wrote. */
export type PracticeServerMessage =
  | { type: "transcript-delta"; text: string } // candidate's own words, from Scribe
  | { type: "star-covered"; part: StarPart; seconds: number }
  | { type: "filler-count"; count: number }
  | { type: "agent-speaking"; text: string } // the FIXED question text or a FIXED probe string, never generated
  | { type: "probe"; probeIndex: number } // an index into Question.probes — the model picks, never writes
  | {
      type: "feedback";
      covered: Record<StarPart, { covered: boolean; seconds: number }>;
      fillerCount: number;
      totalSeconds: number;
    };
