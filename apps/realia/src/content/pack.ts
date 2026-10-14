import type { LessonPack } from "@realia/shared";

const RELAY_HTTP_URL = "ws://localhost:8787".replace("ws", "http");
export const DEFAULT_PACK_ID = "a2-prepositions-place";
const SELECTED_PACK_KEY = "realia.selectedPackId";
const SELECTED_PACK_IS_CUSTOM_KEY = "realia.selectedPackIsCustom";

/** Static packs come bundled with the extension; a generated pack (approved via the options page) lives on the relay instead — see apps/realia-relay/src/packs.ts's comment for why. */
export async function loadPack(packId: string, isCustom = false): Promise<LessonPack> {
  const res = isCustom
    ? await fetch(`${RELAY_HTTP_URL}/packs/${packId}`)
    : await fetch(chrome.runtime.getURL(`packs/${packId}.json`));
  return (await res.json()) as LessonPack;
}

/** Which pack this session should load — the teacher's last-approved generated pack, or the shipped default if none has been approved yet. */
export async function getSelectedPack(): Promise<{ packId: string; isCustom: boolean }> {
  const result = await chrome.storage.local.get([SELECTED_PACK_KEY, SELECTED_PACK_IS_CUSTOM_KEY]);
  const packId = (result[SELECTED_PACK_KEY] as string | undefined) ?? DEFAULT_PACK_ID;
  const isCustom = (result[SELECTED_PACK_IS_CUSTOM_KEY] as boolean | undefined) ?? false;
  return { packId, isCustom };
}

/** Called once a draft is approved on the options page — makes it the pack the next session loads, on both sides (see loadPack's custom-fetch branch). */
export async function setSelectedPack(packId: string, isCustom: boolean): Promise<void> {
  await chrome.storage.local.set({ [SELECTED_PACK_KEY]: packId, [SELECTED_PACK_IS_CUSTOM_KEY]: isCustom });
}

/**
 * zone id -> the label to slot into sentenceTemplate's {anchor}. Derived
 * from the pack's own scenery labels so this can never drift from what
 * the relay resolves (apps/realia-relay/src/packs.ts), replacing the
 * hardcoded stand-in used before real packs existed (prompts 3-6).
 */
export function buildZoneAnchorLabel(pack: LessonPack): Record<string, string> {
  const bySceneryId = new Map(pack.scenery.map((s) => [s.id, s.label]));
  const out: Record<string, string> = {};
  for (const z of pack.zones) {
    if (z.anchor === "both") {
      // "between the chair and table" — see apps/realia-relay/src/packs.ts's
      // matching special case for why "both" only ever means these two.
      out[z.id] = pack.scenery.map((s) => s.label).slice(0, 2).join(" and ");
      continue;
    }
    out[z.id] = bySceneryId.get(z.anchor) ?? z.anchor;
  }
  return out;
}
