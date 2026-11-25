import { getSelectedPackId } from "../content/pack";
import {
  draftLesson,
  fetchPack,
  latestSeed,
  type DraftLesson,
  type Door,
  type LessonBrief,
  type RawMaterial,
} from "./api";
import { documentToMaterial, isPhoto, MAX_PHOTOS, photoToMaterial, recordingToMaterial } from "./images";
import { renderServiceError } from "./errors";

// One form, three doors into the one generator, five fields. Teachers
// will not fill in more than five, so there are five.

const DEFAULTS_KEY = "realia.briefDefaults";
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** The parts of the brief that rarely change between lessons. Never the photos. */
interface BriefDefaults {
  lengthMinutes: number;
  format: "one-to-one" | "group";
  level: string;
  firstLanguage: string;
}

async function loadDefaults(): Promise<BriefDefaults> {
  const stored = (await chrome.storage.local.get(DEFAULTS_KEY))[DEFAULTS_KEY] as Partial<BriefDefaults> | undefined;
  return { lengthMinutes: 60, format: "one-to-one", level: "B1", firstLanguage: "", ...stored };
}

export interface LessonFormHandlers {
  onDraft: (draft: DraftLesson, brief: LessonBrief) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | number | boolean> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

function field(labelText: string, ...controls: Node[]): HTMLLabelElement {
  return el("label", { className: "co-field" }, el("span", { className: "co-field-label" }, labelText), ...controls);
}

export async function mountLessonForm(root: HTMLElement, handlers: LessonFormHandlers): Promise<void> {
  const defaults = await loadDefaults();
  root.replaceChildren();

  root.append(
    el("h2", {}, "Prepare a lesson"),
    el(
      "p",
      { className: "co-draft-hint" },
      "Claude drafts the drag-and-drop activities and a teaching plan with the answer key. You review both before anything is used. Photos are only read for this draft — they are never saved or shown on the stage.",
    ),
  );

  // --- The three doors. ---
  const doors: Array<[Door, string]> = [
    ["coursebook", "From this week's coursebook pages"],
    ["last-lesson", "From last lesson (its results and pack)"],
    ["scratch", "From scratch (just my notes below)"],
  ];
  const doorRow = el("div", { className: "co-doors" });
  for (const [value, text] of doors) {
    const input = el("input", { type: "radio", name: "door", value, checked: value === "coursebook" });
    doorRow.append(el("label", { className: "co-door" }, input, text));
  }
  root.append(doorRow);
  const door = () => (doorRow.querySelector<HTMLInputElement>("input:checked")?.value ?? "coursebook") as Door;

  // 1. Photos (and notes).
  const fileInput = el("input", { type: "file", multiple: true, accept: "image/*,.txt,.md,.pdf,.docx" });
  const fileList = el("ul", { className: "co-draft-file-list" });
  fileInput.addEventListener("change", () => {
    fileList.replaceChildren(
      ...Array.from(fileInput.files ?? []).map((f) => el("li", {}, `${isPhoto(f) ? "📷" : "📄"} ${f.name}`)),
    );
  });
  const photosField = field("1. Photos of the pages (and any notes or last lesson's transcript)", fileInput, fileList);

  // 2. Length and format.
  const lengthInput = el("input", { type: "number", min: "15", max: "180", step: "5", value: String(defaults.lengthMinutes) });
  const formatSelect = el("select", {}, el("option", { value: "one-to-one" }, "one-to-one"), el("option", { value: "group" }, "group"));
  formatSelect.value = defaults.format;
  const lengthField = field("2. How long, and who", el("div", { className: "co-row" }, lengthInput, el("span", {}, "minutes"), formatSelect));

  // 3. The student.
  const levelSelect = el("select", {}, ...LEVELS.map((l) => el("option", { value: l }, l)));
  levelSelect.value = defaults.level;
  const languageInput = el("input", { type: "text", placeholder: "first language, e.g. Czech", value: defaults.firstLanguage });
  const studentField = field("3. The student: level and first language", el("div", { className: "co-row" }, levelSelect, languageInput));

  // 4. Done / new.
  const doneInput = el("textarea", {
    rows: 2,
    placeholder: "e.g. vocabulary page was homework and is half done; modals are revision; exercise 4 is new",
  });
  const doneField = field("4. What is already done, and what is new", doneInput);

  // 5. Focus (optional), typed or spoken.
  const focusInput = el("textarea", { rows: 2, placeholder: "optional — e.g. mustn't vs don't have to" });
  const recordBtn = el("button", { type: "button", className: "co-draft-btn" }, "🎙 Say it instead");
  const recordStatus = el("span", { className: "co-draft-record-status" });
  const focusField = field("5. What to focus on", focusInput, el("div", { className: "co-draft-record-row" }, recordBtn, recordStatus));

  root.append(photosField, lengthField, studentField, doneField, focusField);

  let recorded: Blob | null = null;
  let recorder: MediaRecorder | null = null;
  recordBtn.addEventListener("click", async () => {
    if (recorder) {
      recorder.stop();
      recorder = null;
      recordBtn.textContent = "🎙 Say it instead";
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        recorded = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        recordStatus.textContent = "Voice note recorded ✓ (transcribed by the service)";
      };
      recorder.start();
      recordBtn.textContent = "⏹ Stop";
      recordStatus.textContent = "Recording…";
    } catch {
      recordStatus.textContent = "Microphone access was denied.";
    }
  });

  const submit = el("button", { type: "button", className: "co-draft-btn co-draft-btn-primary" }, "Draft the lesson");
  const status = el("div", { className: "co-draft-status" });
  root.append(submit, status);

  function syncDoor() {
    photosField.querySelector(".co-field-label")!.textContent =
      door() === "scratch" ? "1. Notes (optional — no photos needed)" : "1. Photos of the pages (and any notes or last lesson's transcript)";
  }
  doorRow.addEventListener("change", syncDoor);

  submit.addEventListener("click", async () => {
    const files = Array.from(fileInput.files ?? []);
    const photos = files.filter(isPhoto);
    if (door() === "coursebook" && files.length === 0) {
      status.replaceChildren("Add a photo of the pages — or choose “From scratch”.");
      return;
    }
    if (photos.length > MAX_PHOTOS) {
      status.replaceChildren(`At most ${MAX_PHOTOS} photos per lesson.`);
      return;
    }

    const brief: LessonBrief = {
      door: door(),
      lengthMinutes: Math.max(15, Math.min(180, Number(lengthInput.value) || 60)),
      format: formatSelect.value as LessonBrief["format"],
      level: levelSelect.value,
      firstLanguage: languageInput.value.trim(),
      doneAndNew: doneInput.value.trim(),
      ...(focusInput.value.trim() ? { focus: focusInput.value.trim() } : {}),
    };
    await chrome.storage.local.set({
      [DEFAULTS_KEY]: { lengthMinutes: brief.lengthMinutes, format: brief.format, level: brief.level, firstLanguage: brief.firstLanguage },
    });

    submit.disabled = true;
    const startedAt = Date.now();
    const tick = window.setInterval(() => {
      status.replaceChildren(`Claude is reading the pages and drafting the lesson… ${Math.round((Date.now() - startedAt) / 1000)}s (usually one to three minutes)`);
    }, 1000);
    try {
      status.replaceChildren("Preparing the photos…");
      const materials: RawMaterial[] = [];
      for (const f of files) materials.push(isPhoto(f) ? await photoToMaterial(f) : await documentToMaterial(f));
      if (recorded) materials.push(await recordingToMaterial(recorded));

      let referencePack;
      let lastLesson;
      if (brief.door === "last-lesson") {
        const lastPackId = await getSelectedPackId();
        referencePack = await fetchPack(lastPackId);
        lastLesson = (await latestSeed(lastPackId)) ?? undefined;
      }

      const draft = await draftLesson({ brief, materials, referencePack, lastLesson });
      materials.length = 0; // the photos' bytes are not kept past the request
      fileInput.value = "";
      handlers.onDraft(draft, brief);
    } catch (err) {
      status.replaceChildren(renderServiceError("Couldn't draft the lesson", err));
    } finally {
      window.clearInterval(tick);
      submit.disabled = false;
    }
  });
}
