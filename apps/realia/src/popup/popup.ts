import { getSelectedPackId, RELAY_HTTP_URL } from "../content/pack";

const STORAGE_KEY = "roomCode";

// Ambiguous characters (I, O, 0, 1) left out so a code is easy to read aloud.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

const codeDisplay = document.getElementById("code-display")!;
const createBtn = document.getElementById("create-btn")!;
const joinInput = document.getElementById("join-input") as HTMLInputElement;
const joinBtn = document.getElementById("join-btn")!;
const statusEl = document.getElementById("status")!;

function render(code: string | undefined) {
  codeDisplay.textContent = code ?? "—";
  statusEl.textContent = code
    ? "Open a Google Meet call — this device joins that room automatically."
    : "Create a room, or join one with a code from your teacher.";
}

chrome.storage.local.get(STORAGE_KEY, (result) => render(result[STORAGE_KEY]));

createBtn.addEventListener("click", () => {
  const code = randomCode();
  chrome.storage.local.set({ [STORAGE_KEY]: code }, () => render(code));
});

joinBtn.addEventListener("click", () => {
  const code = joinInput.value.trim().toUpperCase();
  if (!code) return;
  chrome.storage.local.set({ [STORAGE_KEY]: code }, () => render(code));
});

// Which lesson a room created from here will play — so the teacher can check before sharing the code.
const lessonEl = document.getElementById("lesson");
void (async () => {
  const packId = await getSelectedPackId();
  let title = packId;
  try {
    const res = await fetch(`${RELAY_HTTP_URL}/packs/${encodeURIComponent(packId)}`);
    if (res.ok) title = ((await res.json()) as { title?: string }).title ?? packId;
  } catch {
    /* relay not running: show the id */
  }
  if (lessonEl) lessonEl.textContent = `Lesson for a new room: ${title}`;
})();

const planBtn = document.getElementById("plan-btn");
planBtn?.addEventListener("click", () => chrome.runtime.openOptionsPage());
