import { startSession, type Session } from "./session";

console.log("[clickable-objects] content script loaded on", location.href);

const STORAGE_KEY = "roomCode";

let session: Session | null = null;
let currentCode: string | null = null;

function applyCode(code: string | undefined) {
  if (code === currentCode) return;
  session?.destroy();
  session = null;
  currentCode = code ?? null;
  if (code) session = startSession(code);
}

chrome.storage.local.get(STORAGE_KEY, (result) => {
  applyCode(result[STORAGE_KEY] as string | undefined);
});

// Rejoin automatically on reload (chrome.storage persists across
// reloads) and pick up a code created/joined via the popup without
// requiring a manual page reload.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  applyCode(changes[STORAGE_KEY].newValue as string | undefined);
});
