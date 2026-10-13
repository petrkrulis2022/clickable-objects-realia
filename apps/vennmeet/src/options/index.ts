import { mountEditor } from "./editor";
import { hasSeenOnboarding, showOnboarding } from "./onboarding";

console.log("[venn] options page loaded");

async function main() {
  const root = document.getElementById("app");
  if (!root) return;

  // Reopening from the popup (docs/SPEC-VENNMEET.md: "reopens from
  // the popup") links to options.html#onboarding, which shows it
  // again regardless of whether it's already been seen.
  const forced = location.hash === "#onboarding";
  if (forced || !(await hasSeenOnboarding())) {
    await showOnboarding(document.body);
  }

  mountEditor(root);
}

void main();
