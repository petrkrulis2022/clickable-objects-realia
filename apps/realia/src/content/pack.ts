import { loadValidPack, type CardAudio, type LessonPack } from "@realia/shared";

// Deployed against a real call this must be https:// with a valid
// certificate, like the relay's wss:// (docs/PRD.md, "The relay").
export const RELAY_HTTP_URL = "http://localhost:8787";
export const DEFAULT_PACK_ID = "a2-prepositions-place";
const SELECTED_PACK_KEY = "realia.selectedPackId";

/**
 * Every pack — shipped or approved — is fetched from the relay, which
 * serves it normalised and validated. Teacher and student therefore
 * always resolve the identical bytes, and the client validates again
 * before using it: an invalid pack is never loaded.
 */
export async function loadPack(packId: string): Promise<LessonPack> {
  const res = await fetch(`${RELAY_HTTP_URL}/packs/${encodeURIComponent(packId)}`);
  if (!res.ok) throw new Error(`pack "${packId}" could not be loaded (${res.status})`);
  return loadValidPack(await res.json());
}

/** The lesson this browser's teacher chose on the options page, or the shipped default. Only used to create a room. */
export async function getSelectedPackId(): Promise<string> {
  const result = await chrome.storage.local.get(SELECTED_PACK_KEY);
  return (result[SELECTED_PACK_KEY] as string | undefined) ?? DEFAULT_PACK_ID;
}

export async function setSelectedPackId(packId: string): Promise<void> {
  await chrome.storage.local.set({ [SELECTED_PACK_KEY]: packId });
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

/**
 * zone id -> the label to slot into sentenceTemplate's {anchor}. Derived
 * from the pack's own scenery labels so this can never drift from what
 * the relay resolves.
 */
export function buildZoneAnchorLabel(pack: LessonPack): Record<string, string> {
  const bySceneryId = new Map(pack.scenery.map((s) => [s.id, s.label]));
  const out: Record<string, string> = {};
  for (const z of pack.zones) {
    if (z.anchor === undefined) continue;
    if (z.anchor === "both") {
      // "between the chair and table" — see @realia/shared's layout for
      // why "both" only ever means these two.
      out[z.id] = pack.scenery.map((s) => s.label).slice(0, 2).join(" and ");
      continue;
    }
    out[z.id] = bySceneryId.get(z.anchor) ?? z.anchor;
  }
  return out;
}
