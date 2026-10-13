// Two entry points that share nothing but the renderer (docs/SPEC-
// SCREENVIEW.md, "1. Scaffold and the two modes"). `./interview` has
// no import, anywhere in its module graph, of fetch/WebSocket/
// getUserMedia — that's the actual guarantee the mode-isolation test
// checks, not just this early return. `./practiceUi` is the only
// place in the extension that touches the network or the microphone,
// and it only runs when this branch is taken.
console.log("[screenview] content script loaded on", location.href);

const MODE_KEY = "screenview.mode";

async function main() {
  const result = await chrome.storage.local.get(MODE_KEY);
  const mode = (result[MODE_KEY] as string | undefined) ?? "interview";

  if (mode === "practice") {
    const { runPracticeMode } = await import("../practiceUi/index");
    await runPracticeMode();
  } else {
    const { runInterviewMode } = await import("../interview/index");
    await runInterviewMode();
  }
}

void main();
