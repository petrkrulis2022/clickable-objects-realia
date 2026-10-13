import { randomUUID } from "node:crypto";
import type {
  PracticeClientMessage,
  PracticeServerMessage,
  PracticeSessionStartRequest,
  PracticeSessionStartResponse,
} from "@screenview/shared";
import { FIXED_PROBES } from "@screenview/shared";
import { AnswerSession } from "./session.js";
import type { TranscribeAdapter } from "./scribeAdapter.js";
import type { VoiceAgentAdapter } from "./agentAdapter.js";

export interface ServerDeps {
  scribe: TranscribeAdapter;
  agent: VoiceAgentAdapter;
}

/** One sessionToken per question-answering attempt (docs/SPEC-SCREENVIEW.md: a retry is a second session for the same question). */
export class SessionStore {
  private sessions = new Map<string, AnswerSession>();

  start(request: PracticeSessionStartRequest): PracticeSessionStartResponse {
    const sessionToken = randomUUID();
    this.sessions.set(sessionToken, new AnswerSession({ role: request.role, question: request.question }));
    return { sessionToken };
  }

  get(sessionToken: string): AnswerSession | undefined {
    return this.sessions.get(sessionToken);
  }

  end(sessionToken: string): void {
    this.sessions.delete(sessionToken);
  }
}

/** "It asks the question aloud, then waits in silence" (SPEC, "4. The AI interviewer") — spoken once, at session start. */
export async function speakQuestion(
  session: AnswerSession,
  deps: ServerDeps,
  send: (m: PracticeServerMessage) => void,
): Promise<void> {
  send({ type: "agent-speaking", text: session.question.text });
  await deps.agent.speak(session.question.text);
}

/**
 * Handles one client message for one session, emitting zero or more
 * PracticeServerMessages via `send`. Pure with respect to I/O — the
 * adapters are injected — so this is fully testable without a real
 * websocket, HTTP server, or ElevenLabs account. Every message
 * variant it can send is enum/number/boolean/index/the candidate's own
 * transcript, per packages/screenview-shared's protocol comment.
 */
export async function handleClientMessage(
  session: AnswerSession,
  message: PracticeClientMessage,
  deps: ServerDeps,
  send: (m: PracticeServerMessage) => void,
): Promise<void> {
  if (message.type === "audio-chunk") {
    const text = await deps.scribe.transcribeChunk(message.base64);
    if (!text) return;

    const result = session.handleTranscriptDelta(text);
    send({ type: "transcript-delta", text });
    if (result.part) send({ type: "star-covered", part: result.part, seconds: result.seconds });
    if (result.fillerDelta > 0) send({ type: "filler-count", count: session.feedback().fillerCount });
    return;
  }

  // answer-ended: decide whether to probe (at most once) or finalize feedback.
  const probeIndex = session.decideProbeIndex();
  if (probeIndex !== null) {
    const probeText = FIXED_PROBES[probeIndex];
    send({ type: "probe", probeIndex });
    send({ type: "agent-speaking", text: probeText });
    await deps.agent.speak(probeText);
    return; // the candidate keeps answering; the next answer-ended finalizes feedback
  }

  send({ type: "feedback", ...session.feedback() });
}
