import type { LessonPack } from "@co/shared";

export async function loadPack(packId: string): Promise<LessonPack> {
  const res = await fetch(chrome.runtime.getURL(`packs/${packId}.json`));
  return (await res.json()) as LessonPack;
}

/**
 * zone id -> the label to slot into sentenceTemplate's {anchor}. Derived
 * from the pack's own scenery labels so this can never drift from what
 * the relay resolves (apps/relay/src/packs.ts), replacing the
 * hardcoded stand-in used before real packs existed (prompts 3-6).
 */
export function buildZoneAnchorLabel(pack: LessonPack): Record<string, string> {
  const bySceneryId = new Map(pack.scenery.map((s) => [s.id, s.label]));
  const out: Record<string, string> = {};
  for (const z of pack.zones) {
    if (z.anchor === "both") {
      // "between the chair and table" — see apps/relay/src/packs.ts's
      // matching special case for why "both" only ever means these two.
      out[z.id] = pack.scenery.map((s) => s.label).slice(0, 2).join(" and ");
      continue;
    }
    out[z.id] = bySceneryId.get(z.anchor) ?? z.anchor;
  }
  return out;
}
