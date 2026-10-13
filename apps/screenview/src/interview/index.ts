// Interview mode (docs/SPEC-SCREENVIEW.md, "6. Interview mode and
// onboarding" + "1. Scaffold and the two modes"): "Interview mode does
// none of that: no socket, no microphone request, no service."
//
// This module, and everything it imports, must never call fetch,
// construct a WebSocket, or call getUserMedia — that absence, not
// just the mode check in content/index.ts, is the actual guarantee
// the mode-isolation test (scripts/check-interview-isolation.mjs)
// verifies by grep as well as by runtime simulation.
import type { InterviewDeck } from "@screenview/shared";
import { getRole } from "../options/roles";
import { mountDeckView } from "./deckView";
import { onShareChange } from "../content/shareWatcher";

const SELECTED_ROLE_KEY = "screenview.selectedRoleId";

export async function runInterviewMode(): Promise<void> {
  // The runtime isolation test (index.test.ts) runs this in plain
  // Node, with no DOM — a real content script always has one. Bailing
  // out here is about that environment gap, not a production branch.
  if (typeof document === "undefined") return;

  const stored = await chrome.storage.local.get(SELECTED_ROLE_KEY);
  const roleId = stored[SELECTED_ROLE_KEY] as string | undefined;
  const role = roleId ? await getRole(roleId) : undefined;
  if (!role) return;

  // "On the day, the private layer carries one thing: the map of
  // competencies and which story answers each" — competency name and
  // linked story title only, never a sentence.
  const deck: InterviewDeck = {
    roleId: role.id,
    cards: role.competencies.map((c) => ({
      competency: c.name,
      storyTitle: role.stories.find((s) => c.storyIds.includes(s.id))?.title ?? "",
    })),
  };

  const view = mountDeckView(deck);
  onShareChange((sharing) => view.setHidden(sharing));
}
