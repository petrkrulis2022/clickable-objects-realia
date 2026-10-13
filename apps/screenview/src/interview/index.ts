// Interview mode (docs/SPEC-SCREENVIEW.md, "6. Interview mode and
// onboarding" + "1. Scaffold and the two modes"): "Interview mode does
// none of that: no socket, no microphone request, no service."
//
// This module, and everything it imports, must never call fetch,
// construct a WebSocket, or call getUserMedia — that absence, not
// just the mode check in content/index.ts, is the actual guarantee
// the mode-isolation test (scripts/mode-isolation-test checks)
// verifies by grep as well as by runtime simulation.
export async function runInterviewMode(): Promise<void> {
  console.log("[screenview] interview mode — rendering the coverage deck as a private layer");
  // The actual private-layer rendering (docs/SPEC-SCREENVIEW.md,
  // "On the day, the private layer carries one thing...") arrives in
  // "6. Interview mode and onboarding".
}
