// Practice mode (docs/SPEC-SCREENVIEW.md, "1. Scaffold and the two
// modes"): "opens a session with the practice service, requests the
// microphone at that moment, runs the agent." This is the ONLY module
// in the extension that touches the network or the microphone — see
// ../interview/index.ts's comment for why that separation matters.
export async function runPracticeMode(): Promise<void> {
  console.log("[screenview] practice mode — session loop arrives in prompt 3");
  // The microphone request, the practice-service connection, and the
  // STAR block UI arrive in "3. The practice session loop" and
  // "4. The AI interviewer". Deliberately not even a fetch() to the
  // health endpoint yet — nothing here should touch the network until
  // the feature that needs it is actually built.
}
