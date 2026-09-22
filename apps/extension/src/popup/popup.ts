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
