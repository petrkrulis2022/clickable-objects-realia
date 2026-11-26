import type { CardAudio } from "@realia/shared";

// The content script never fetches a pack: a pack holds every answer.
// It plays from the WebSocket alone — objects through the role filter,
// the teacher's key in a teacher-only "lesson" message.

// Deployed against a real call this must be https:// with a valid
// certificate, like the relay's wss:// (docs/PRD.md, "The relay").
export const RELAY_HTTP_URL = "http://localhost:8787";
export const DEFAULT_PACK_ID = "a2-prepositions-place";
const SELECTED_PACK_KEY = "realia.selectedPackId";

/** The lesson this browser's teacher chose on the options page, or the shipped default. Only used to create a room. */
export async function getSelectedPackId(): Promise<string> {
  const result = await chrome.storage.local.get(SELECTED_PACK_KEY);
  return (result[SELECTED_PACK_KEY] as string | undefined) ?? DEFAULT_PACK_ID;
}

export async function setSelectedPackId(packId: string): Promise<void> {
  await chrome.storage.local.set({ [SELECTED_PACK_KEY]: packId });
}

// --- Lesson links (/packs/<id>/<token>). The relay gives a lesson's link
// to the teacher only — when she saves it, and in her teacher-only lesson
// message — and it is the only way to read the lesson's file, plan or
// results. Kept in the teacher's browser; a student's never receives one.

const LESSON_LINKS_KEY = "realia.lessonLinks";

export async function rememberLessonLink(packId: string, link: string): Promise<void> {
  const links = ((await chrome.storage.local.get(LESSON_LINKS_KEY))[LESSON_LINKS_KEY] as Record<string, string> | undefined) ?? {};
  if (links[packId] === link) return;
  await chrome.storage.local.set({ [LESSON_LINKS_KEY]: { ...links, [packId]: link } });
}

export async function getLessonLink(packId: string): Promise<string | null> {
  const links = (await chrome.storage.local.get(LESSON_LINKS_KEY))[LESSON_LINKS_KEY] as Record<string, string> | undefined;
  return links?.[packId] ?? null;
}

/**
 * Where a card's pre-generated audio lives: bundled files ("audio/…")
 * come from the extension; files generated at approval ("/packs/…")
 * come from the relay. Nothing is ever synthesised here.
 */
export function audioUrl(audio: CardAudio, speed: "normal" | "slow"): string {
  const path = audio[speed];
  return path.startsWith("/") ? `${RELAY_HTTP_URL}${path}` : chrome.runtime.getURL(path);
}
