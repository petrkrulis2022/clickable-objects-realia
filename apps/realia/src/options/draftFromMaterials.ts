import type { LessonPack } from "@realia/shared";
import { DEFAULT_PACK_ID, loadPack } from "../content/pack";

const ASSIST_URL = "http://localhost:8790";

type MaterialKind = "text" | "pdf" | "docx" | "audio";
interface RawMaterial {
  kind: MaterialKind;
  filename: string;
  text?: string;
  base64?: string;
}

export interface DraftPlan {
  items: LessonPack["items"];
  summary: string;
}

function kindForFile(file: File): MaterialKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (file.type.startsWith("audio/")) return "audio";
  return "text";
}

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function fileToRawMaterial(file: File): Promise<RawMaterial> {
  const kind = kindForFile(file);
  if (kind === "text") return { kind, filename: file.name, text: await file.text() };
  return { kind, filename: file.name, base64: await fileToBase64(file) };
}

export interface DraftFormHandlers {
  onDraftReady: (draft: DraftPlan, referencePack: LessonPack) => void;
}

/**
 * Upload form for next session's plan (docs/PRD.md, "10. The plan
 * generator"): notes/transcripts/documents plus an optional voice
 * recording. The reference pack is always the one currently selected
 * for this room — the draft only ever reuses ITS existing vocabulary,
 * scenery and zones (enforced server-side in apps/meeting-assist, not
 * just requested).
 */
export function mountDraftForm(root: HTMLElement, handlers: DraftFormHandlers): void {
  root.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = "Draft next session's plan";
  root.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "co-draft-hint";
  hint.textContent =
    "Upload notes or a transcript from the last session, or record a quick voice note about what to focus on. The draft only reuses this pack's existing words and zones — nothing new is invented — and you approve it before it's used.";
  root.appendChild(hint);

  const notesLabel = document.createElement("label");
  notesLabel.textContent = "What to focus on (optional)";
  const notesInput = document.createElement("textarea");
  notesInput.rows = 3;
  notesInput.placeholder = "e.g. struggled with behind/between last time, confident on on/under";
  notesLabel.appendChild(notesInput);
  root.appendChild(notesLabel);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.accept = ".txt,.md,.pdf,.docx";
  fileInput.style.display = "none";
  root.appendChild(fileInput);

  const attachBtn = document.createElement("button");
  attachBtn.className = "co-draft-btn";
  attachBtn.textContent = "Attach notes (.txt, .md, .pdf, .docx)";
  attachBtn.addEventListener("click", () => fileInput.click());
  root.appendChild(attachBtn);

  const fileListEl = document.createElement("ul");
  fileListEl.className = "co-draft-file-list";
  root.appendChild(fileListEl);
  fileInput.addEventListener("change", () => {
    fileListEl.innerHTML = "";
    for (const file of Array.from(fileInput.files ?? [])) {
      const li = document.createElement("li");
      li.textContent = file.name;
      fileListEl.appendChild(li);
    }
  });

  const recordRow = document.createElement("div");
  recordRow.className = "co-draft-record-row";
  const recordBtn = document.createElement("button");
  recordBtn.className = "co-draft-btn";
  recordBtn.textContent = "🎙 Record a voice note";
  const recordStatus = document.createElement("span");
  recordStatus.className = "co-draft-record-status";
  recordRow.append(recordBtn, recordStatus);
  root.appendChild(recordRow);

  let recordedAudio: Blob | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recording = false;

  recordBtn.addEventListener("click", async () => {
    if (!recording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks: Blob[] = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
          recordedAudio = new Blob(chunks, { type: "audio/webm" });
          stream.getTracks().forEach((t) => t.stop());
          recordStatus.textContent = "Voice note recorded ✓";
        };
        mediaRecorder.start();
        recording = true;
        recordBtn.textContent = "⏹ Stop recording";
        recordStatus.textContent = "Recording…";
      } catch {
        recordStatus.textContent = "Microphone access was denied.";
      }
    } else {
      mediaRecorder?.stop();
      recording = false;
      recordBtn.textContent = "🎙 Record a voice note";
    }
  });

  const submitBtn = document.createElement("button");
  submitBtn.className = "co-draft-btn co-draft-btn-primary";
  submitBtn.textContent = "Draft the plan";
  root.appendChild(submitBtn);

  const statusEl = document.createElement("p");
  statusEl.className = "co-draft-status";
  root.appendChild(statusEl);

  submitBtn.addEventListener("click", async () => {
    submitBtn.disabled = true;
    statusEl.textContent = "Loading the current pack…";
    try {
      const referencePack = await loadPack(DEFAULT_PACK_ID);

      statusEl.textContent = "Reading materials…";
      const materials: RawMaterial[] = [];
      for (const file of Array.from(fileInput.files ?? [])) materials.push(await fileToRawMaterial(file));
      if (recordedAudio) {
        materials.push({ kind: "audio", filename: "voice-note.webm", base64: await fileToBase64(recordedAudio) });
      }

      statusEl.textContent = "Drafting with the assist service…";
      const res = await fetch(`${ASSIST_URL}/plan/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product: "realia", referencePack, focusNotes: notesInput.value || undefined, materials }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);

      statusEl.textContent = "";
      handlers.onDraftReady(body.draft, referencePack);
    } catch (err) {
      statusEl.textContent = `Couldn't draft a plan: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      submitBtn.disabled = false;
    }
  });
}
