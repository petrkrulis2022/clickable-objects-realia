import type { Deck, Section } from "@vennmeet/shared";

const ASSIST_URL = "http://localhost:8790";

type MaterialKind = "text" | "pdf" | "docx" | "audio";
interface RawMaterial {
  kind: MaterialKind;
  filename: string;
  text?: string;
  base64?: string;
}

function genId(): string {
  return crypto.randomUUID();
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

/** Assembles a real, saveable Deck from the assist service's draft — ids, timestamps and the draftedByModel flag all get filled in here, not by the service. */
export function assembleDeckFromDraft(draft: { name: string; sections: Section[] }): Deck {
  const now = new Date().toISOString();
  return {
    id: genId(),
    name: draft.name,
    template: "ai-draft",
    visibility: "private",
    sections: draft.sections,
    createdAt: now,
    updatedAt: now,
    draftedByModel: true,
  };
}

export interface DraftFormHandlers {
  onDraftReady: (deck: Deck) => void;
}

/**
 * The upload form: pasted context, file materials (text/pdf/docx —
 * extension or mime-sniffed), and an optional recorded voice note.
 * Submitting calls the shared meeting-assist service (apps/meeting-assist)
 * and hands the caller back a ready-to-save Deck.
 */
export function mountDraftForm(root: HTMLElement, handlers: DraftFormHandlers): void {
  root.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = "Draft a deck from materials";
  root.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "venn-draft-hint";
  hint.textContent =
    "Paste context, attach notes/transcripts/documents, or record a voice note. The draft opens in the editor for you to review before your meeting — nothing is used as-is.";
  root.appendChild(hint);

  const contextLabel = document.createElement("label");
  contextLabel.textContent = "Context for this meeting (optional)";
  const contextInput = document.createElement("textarea");
  contextInput.rows = 3;
  contextInput.placeholder = "e.g. Client meeting with Acme — discuss phase 2 scope and pricing";
  contextLabel.appendChild(contextInput);
  root.appendChild(contextLabel);

  // input[type="file"] is hidden globally (options.html) — matching
  // the existing Import JSON pattern, a visible button triggers it.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.accept = ".txt,.md,.pdf,.docx";
  root.appendChild(fileInput);

  const attachBtn = document.createElement("button");
  attachBtn.className = "venn-btn";
  attachBtn.textContent = "Attach materials (.txt, .md, .pdf, .docx)";
  attachBtn.addEventListener("click", () => fileInput.click());
  root.appendChild(attachBtn);

  const fileListEl = document.createElement("ul");
  fileListEl.className = "venn-draft-file-list";
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
  recordRow.className = "venn-draft-record-row";
  const recordBtn = document.createElement("button");
  recordBtn.className = "venn-btn";
  recordBtn.textContent = "🎙 Record a voice note";
  const recordStatus = document.createElement("span");
  recordStatus.className = "venn-draft-record-status";
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
  submitBtn.className = "venn-btn venn-btn-primary";
  submitBtn.textContent = "Generate draft";
  root.appendChild(submitBtn);

  const statusEl = document.createElement("p");
  statusEl.className = "venn-draft-status";
  root.appendChild(statusEl);

  submitBtn.addEventListener("click", async () => {
    submitBtn.disabled = true;
    statusEl.textContent = "Reading materials…";
    try {
      const materials: RawMaterial[] = [];
      for (const file of Array.from(fileInput.files ?? [])) materials.push(await fileToRawMaterial(file));
      if (recordedAudio) {
        materials.push({ kind: "audio", filename: "voice-note.webm", base64: await fileToBase64(recordedAudio) });
      }

      statusEl.textContent = "Drafting with the assist service…";
      const res = await fetch(`${ASSIST_URL}/plan/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product: "vennmeet", meetingContext: contextInput.value || undefined, materials }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);

      const deck = assembleDeckFromDraft(body.draft);
      statusEl.textContent = "";
      handlers.onDraftReady(deck);
    } catch (err) {
      statusEl.textContent = `Couldn't draft a deck: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      submitBtn.disabled = false;
    }
  });
}
