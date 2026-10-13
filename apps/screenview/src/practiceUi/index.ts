import type { Answer, Covered, PracticeServerMessage, Question, Role, Story } from "@screenview/shared";
import { splitTranscriptByElement } from "@screenview/shared";
import { mountShadowLayer } from "@overlay/shared";
import { getRole } from "../options/roles";
import { dealQuestion, generateQuestionBank } from "./questions";
import { fadeLevelForSession, notesForStarPart, PART_ORDER } from "./fade";
import { computeSessionSummary, listSessions, newSession, nextSessionNumber, saveSession } from "./sessionStore";
import { mountStageView, type StageView } from "./stageView";
import { mountFeedbackView } from "./feedbackView";
import { PANEL_BG, PANEL_RADIUS_PX, PANEL_SHADOW, SYSTEM_FONT_STACK, TEXT_COLOR } from "../content/design";

// Practice mode (docs/SPEC-SCREENVIEW.md, "1. Scaffold and the two
// modes"): "opens a session with the practice service, requests the
// microphone at that moment, runs the agent." This is the ONLY module
// in the extension that touches the network or the microphone — see
// ../interview/index.ts's comment for why that separation matters.
//
// Mic/websocket behaviour below is real but unverified live in this
// environment — no browser, no microphone, no running practice
// service to connect to here. The message protocol, stage rendering,
// question dealing and feedback splitting are each separately unit-
// tested; this file is the thin, untestable wiring between them.

const PRACTICE_SERVICE_URL = "http://localhost:8789";
const SELECTED_ROLE_KEY = "screenview.selectedRoleId";

function emptyCovered(): Covered {
  return {
    situation: { covered: false, seconds: 0 },
    task: { covered: false, seconds: 0 },
    action: { covered: false, seconds: 0 },
    result: { covered: false, seconds: 0 },
  };
}

function storyForQuestion(role: Role, question: Question): Story | null {
  const competency = role.competencies.find((c) => c.id === question.competencyId);
  if (!competency) return null;
  return role.stories.find((s) => competency.storyIds.includes(s.id)) ?? null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** A one-line message panel — the pre-session gate and error states (no mic/service reachable, nothing set up yet). */
function showMessage(text: string, actionLabel?: string, onAction?: () => void): { destroy(): void } {
  const layer = mountShadowLayer("screenview-message-host", "screenview-message-layer");
  layer.layerEl.style.pointerEvents = "auto";
  layer.layerEl.style.display = "flex";
  layer.layerEl.style.alignItems = "flex-end";
  layer.layerEl.style.justifyContent = "center";
  layer.layerEl.style.paddingBottom = "40px";

  const panel = document.createElement("div");
  panel.style.cssText = `font-family:${SYSTEM_FONT_STACK};color:${TEXT_COLOR};background:${PANEL_BG};border-radius:${PANEL_RADIUS_PX}px;box-shadow:${PANEL_SHADOW};padding:14px 18px;display:flex;gap:14px;align-items:center;max-width:480px;`;
  const p = document.createElement("p");
  p.style.cssText = "margin:0;font-size:14px;";
  p.textContent = text;
  panel.appendChild(p);
  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    btn.style.cssText = `font-family:${SYSTEM_FONT_STACK};font-size:14px;font-weight:600;border-radius:6px;padding:8px 14px;border:1px solid #3a6ee8;background:#3a6ee8;color:${TEXT_COLOR};cursor:pointer;`;
    btn.addEventListener("click", onAction);
    panel.appendChild(btn);
  }
  layer.layerEl.appendChild(panel);
  return { destroy: () => layer.destroy() };
}

interface AttemptResult {
  parts: ReturnType<typeof splitTranscriptByElement>;
  fillerCount: number;
  totalSeconds: number;
  covered: Covered;
  transcript: string;
  probeAsked?: string;
}

/**
 * Records one answer's full live round trip: opens a practice-service
 * session for this question, requests the mic (only now — "requested
 * at the moment practice starts, never at install", SPEC), streams
 * audio, and resolves once the server sends feedback.
 */
async function recordAnswer(
  role: Role,
  question: Question,
  fadeLevel: ReturnType<typeof fadeLevelForSession>,
): Promise<AttemptResult | null> {
  const story = storyForQuestion(role, question);
  const stage: StageView = mountStageView();
  for (const part of PART_ORDER) stage.setNotes(part, notesForStarPart(fadeLevel, story, part));

  let startRes: { sessionToken: string } | null = null;
  try {
    const res = await fetch(`${PRACTICE_SERVICE_URL}/session/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: { id: role.id, title: role.title, competencies: role.competencies },
        question,
      }),
    });
    startRes = await res.json();
  } catch {
    stage.destroy();
    showMessage("Couldn't reach the practice service — is it running on localhost:8789?");
    return null;
  }
  if (!startRes) {
    stage.destroy();
    return null;
  }
  const sessionToken = startRes.sessionToken;

  const ws = new WebSocket(`${PRACTICE_SERVICE_URL.replace("http", "ws")}/?token=${sessionToken}`);

  let transcript = "";
  const covered = emptyCovered();
  let fillerCount = 0;
  let probeAsked: string | undefined;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  const startedAtMs = Date.now();
  const elapsedTimer = setInterval(() => stage.setElapsedSeconds((Date.now() - startedAtMs) / 1000), 1000);

  function cleanupMedia() {
    clearInterval(elapsedTimer);
    recorder?.stop();
    stream?.getTracks().forEach((t) => t.stop());
  }

  return new Promise<AttemptResult | null>((resolve) => {
    ws.addEventListener("message", (ev) => {
      const msg: PracticeServerMessage = JSON.parse(ev.data as string);
      if (msg.type === "transcript-delta") {
        transcript += (transcript ? " " : "") + msg.text;
      } else if (msg.type === "star-covered") {
        covered[msg.part] = { covered: true, seconds: msg.seconds };
        stage.setCovered(msg.part, true);
      } else if (msg.type === "filler-count") {
        fillerCount = msg.count;
        stage.setFillerCount(fillerCount);
      } else if (msg.type === "probe") {
        probeAsked = question.probes[msg.probeIndex];
        // No text rendering — the agent speaks the probe aloud. The
        // candidate keeps answering; "I'm done" now ends the whole
        // answer (the server only probes once, see decideProbeIndex).
      } else if (msg.type === "feedback") {
        cleanupMedia();
        stage.destroy();
        ws.close();
        resolve({
          parts: splitTranscriptByElement(transcript, msg.covered),
          fillerCount: msg.fillerCount,
          totalSeconds: msg.totalSeconds,
          covered: msg.covered,
          transcript,
          probeAsked,
        });
      }
      // "agent-speaking" carries only FIXED text (the question or a
      // fixed probe) for TTS playback — never rendered on the layer.
    });

    ws.addEventListener("open", async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        cleanupMedia();
        stage.destroy();
        ws.close();
        showMessage("Microphone access was denied — you can try again from the popup.");
        resolve(null);
        return;
      }
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = async (e) => {
        if (!e.data.size || ws.readyState !== WebSocket.OPEN) return;
        const base64 = await blobToBase64(e.data);
        ws.send(JSON.stringify({ type: "audio-chunk", base64 }));
      };
      recorder.start(1000); // ~1s chunks, per the practice-service protocol

      stage.onDone(() => {
        cleanupMedia();
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "answer-ended" }));
      });
    });

    ws.addEventListener("error", () => {
      cleanupMedia();
      stage.destroy();
      resolve(null);
    });
  });
}

function toAnswer(question: Question, attempt: 1 | 2, result: AttemptResult): Answer {
  return {
    questionId: question.id,
    attempt,
    transcript: result.transcript,
    covered: result.covered,
    fillerCount: result.fillerCount,
    totalSeconds: result.totalSeconds,
    probeAsked: result.probeAsked,
  };
}

export async function runPracticeMode(): Promise<void> {
  const stored = await chrome.storage.local.get(SELECTED_ROLE_KEY);
  const roleId = stored[SELECTED_ROLE_KEY] as string | undefined;
  const role = roleId ? await getRole(roleId) : undefined;

  if (!role || role.competencies.length === 0) {
    showMessage("Pick a role with a parsed job description in the ScreenView popup before practising.");
    return;
  }

  const bank = generateQuestionBank(role);
  if (bank.length === 0) {
    showMessage("This role has no competencies yet — add a job description in the options page first.");
    return;
  }

  const sessions = await listSessions(role.id);
  const sessionNumber = nextSessionNumber(sessions);
  const fadeLevel = fadeLevelForSession(sessionNumber);
  const session = newSession(role.id, sessionNumber);
  const askedQuestionIds: string[] = [];
  const lastAttemptByQuestion = new Map<string, AttemptResult>();

  const gate = showMessage(
    `Session ${sessionNumber} — ${role.competencies.length} competencies on the map. Ready when you are.`,
    "Start",
    () => {
      gate.destroy();
      void nextQuestion();
    },
  );

  async function nextQuestion() {
    const question = dealQuestion(bank, role!.competencies, askedQuestionIds);
    if (!question) {
      await endSession();
      return;
    }
    askedQuestionIds.push(question.id);
    await answerQuestion(question);
  }

  async function answerQuestion(question: Question) {
    const result = await recordAnswer(role!, question, fadeLevel);
    if (!result) return;
    lastAttemptByQuestion.set(question.id, result);
    session.answers.push(toAnswer(question, 1, result));
    await saveSession(role!.id, session);

    mountFeedbackView(result.parts, result.fillerCount, result.totalSeconds, 1, null, {
      onAnswerAgain: () => void retry(question),
      onNextQuestion: () => void nextQuestion(),
      onEndSession: () => void endSession(),
    });
  }

  async function retry(question: Question) {
    const priorResult = lastAttemptByQuestion.get(question.id);
    const result = await recordAnswer(role!, question, fadeLevel);
    if (!result) return;
    lastAttemptByQuestion.set(question.id, result);
    session.answers.push(toAnswer(question, 2, result));
    await saveSession(role!.id, session);

    mountFeedbackView(
      result.parts,
      result.fillerCount,
      result.totalSeconds,
      2,
      priorResult
        ? { parts: priorResult.parts, fillerCount: priorResult.fillerCount, totalSeconds: priorResult.totalSeconds }
        : null,
      {
        onAnswerAgain: () => void retry(question),
        onNextQuestion: () => void nextQuestion(),
        onEndSession: () => void endSession(),
      },
    );
  }

  async function endSession() {
    session.endedAt = new Date().toISOString();
    await saveSession(role!.id, session);
    const summary = computeSessionSummary(session, role!);
    showMessage(
      `Session done. Practised: ${summary.competenciesPracticed.join(", ") || "nothing yet"}. ` +
        `Still uncovered: ${summary.stillUncovered.join(", ") || "none"}. Filler trend: ${summary.fillerTrend}.`,
    );
  }
}
